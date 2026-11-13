import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AcademyNav } from '@/features/academy/AcademyNav';
import { ProfessorInterview } from '@/features/academy/components/ProfessorInterview';
import academyStyles from '@/features/academy/academy.module.css';
import { fetchNewsInquiry, fetchWorldArticle } from '@/features/world-today/services/worldNewsService';
import { EMPTY_INQUIRY, inquiryToText } from '@/features/world-today/utils/story';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, History, Loader2, RotateCcw, Search, Users, X, HelpCircle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { useStudentDeepLink } from '@/hooks/useStudentDeepLink';
import './styles/starfield.css';
import './styles/inquiryPanel.css';
import { buildStarShadows } from './utils/starfield';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useInquiryClasses,
  useInquiryStudents,
  useInquiryStudentsSearch,
  type InquiryRosterStudent,
} from './hooks/useInquiryStudentRoster';
import { cn } from '@/lib/utils';
import { ComprehensiveAnalysisPanel } from './components/ComprehensiveAnalysisPanel';
import {
  synthesizeTargetFromCurriculum,
  useCurriculumSubjects,
} from './components/CurriculumSubjectCombobox';
import { InquiryGuideDialog } from './components/guide/InquiryGuideDialog';
import { HistoryPanel } from './components/HistoryPanel';
import { InquiryGraphCanvas } from './components/InquiryGraphCanvas';
import { kgConfidence, kgEvidenceList, kgSourceLabel, kgSourceList } from './utils/kgProperties';
import { kgEdgeId } from './utils/inquiryGraph';
import { resolveDesignedRelation } from './utils/relationDetail';
import { InquirySidePanel } from './components/InquirySidePanel';
import { PriorDesignPromptDialog } from './components/PriorDesignPromptDialog';
import { InquiryGenerationStatus } from './components/InquiryGenerationStatus';
import { findPriorDesigns } from './utils/priorDesignMatch';
import {
  fetchInquiryRequestQuota,
  inquiryGenerationActive,
  readInquiryGenerations,
  retryInquiryGeneration,
  startInquiryGeneration,
} from './services/inquiryGenerationService';
import { PANEL_HANDLE_RIGHT, type PanelWidthMode } from './components/panelWidth';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';
import { logAiError } from '@/services/aiErrorLog';
import { deleteComprehensiveAnalysis } from './services/comprehensiveAnalysisService';
import {
  loadSelectedAchievementContext,
  listAchievementContextIndex,
  normalizeSubjectKey,
} from './services/achievementContextService';
import {
  acceptInquiryProposal,
  buildSourceFromActivity,
  buildSourceFromEntity,
  deleteInquiryDesign,
  fetchInquiryWorkspace,
  INQUIRY_CONTEXT_BUDGET,
  requestInquiryConversation,
  saveAchievementLinks,
  saveInquiryDesign,
  setInquiryObservation,
  updateInquiryReflection,
} from './services/inquiryDesignService';
import type { InquiryConversationMessage } from './services/inquiryDesignService';
import { buildConversationContext } from './utils/conversationSummary';
import type { AchievementLinkRecord } from './utils/achievementStandards';
import type {
  ComprehensiveRecommendation,
  InquiryAiProvider,
  InquiryAnalysisResponse,
  InquiryAnalysisResult,
  InquiryGenerationJob,
  InquirySelectedSource,
  InquiryTarget,
  InquiryWorkspace,
  KgEntityRow,
  KgRelationRow,
  SavedInquiryDesign,
} from './types';

function studentEmailId(email?: string | null) {
  return email?.split('@')[0] ?? '';
}

// 버전을 키에 넣는다. 넣지 않으면 버전을 바꿔도 캐시가 그대로라 화면이 안 바뀐다.
// `invalidateQueries`는 접두 일치라 기존 무효화 호출(버전 없이 부름)은 그대로 동작한다.
function workspaceKey(studentId: string | null, kgVersionId?: string | null) {
  return kgVersionId
    ? (['inquiry-design', 'workspace', studentId, kgVersionId] as const)
    : (['inquiry-design', 'workspace', studentId] as const);
}

function generationKey(ownerId: string | null, studentId: string | null) {
  return ['inquiry-design', 'generation', ownerId, studentId] as const;
}

function quotaKey(studentId: string | null) {
  return ['inquiry-design', 'quota', studentId] as const;
}

const PICKER_GRADES = [1, 2, 3];
const PICKER_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function InquiryStudentRow({
  student,
  isSelected,
  onClick,
  showClassBadge = false,
}: {
  student: InquiryRosterStudent;
  isSelected?: boolean;
  onClick?: () => void;
  showClassBadge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all',
        isSelected
          ? 'border-brand-200 bg-brand-50 shadow-sm'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-100'
      )}
    >
      <span className="w-4 shrink-0 text-right font-mono text-[10px] text-slate-400">
        {student.number ?? ''}
      </span>
      <span className={cn('flex-1 truncate text-sm', isSelected ? 'font-semibold text-brand-700' : 'text-slate-700')}>
        {student.name}
      </span>
      {showClassBadge && (
        <span className="shrink-0 font-mono text-[10px] text-slate-400">
          {student.grade}-{student.class_num}
        </span>
      )}
    </button>
  );
}

function StudentClassRoster({
  grade,
  classNum,
  selectedStudentId,
  onSelectStudent,
}: {
  grade: number;
  classNum: number;
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string | null) => void;
}) {
  const { data: roster = [], isLoading, isError } = useInquiryStudents(grade, classNum);

  if (isLoading) return <div className="ml-4 mt-1 px-2 py-1 text-[11px] text-slate-400">불러오는 중...</div>;
  if (isError) return <div className="ml-4 mt-1 px-2 py-1 text-[11px] text-red-500">불러올 수 없습니다</div>;
  if (roster.length === 0) {
    return (
      <div className="ml-4 mt-1 flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400">
        <Users className="h-3 w-3" />학생 없음
      </div>
    );
  }

  return (
    <ul className="ml-4 mt-0.5 space-y-0.5">
      {roster.map((student) => (
        <li key={student.id}>
          <InquiryStudentRow
            student={student}
            isSelected={selectedStudentId === student.id}
            onClick={() => onSelectStudent(student.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function StudentPicker({
  selectedStudentId,
  onSelectStudent,
}: {
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string | null) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const isSearching = debouncedSearch.trim() !== '';
  const searchResults = useInquiryStudentsSearch(null, debouncedSearch);

  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  const toggleGrade = (g: number) => {
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };
  const toggleClass = (key: string) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const refresh = () => {
    void searchResults.refetch();
  };

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
      <div className="flex shrink-0 items-center justify-between rounded-t-lg border-b border-slate-100 bg-white px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-800">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          학생 목록
        </h2>
        {isSearching && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="h-7 w-7 p-0 hover:bg-slate-100"
            title="검색 초기화"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-b border-slate-100 px-4 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="이름 검색"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 bg-white pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="검색 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-0">
        {isSearching ? (
          searchResults.isFetching ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (searchResults.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">검색 결과가 없습니다</div>
          ) : (
            <div className="space-y-1.5 p-3">
              {(searchResults.data ?? []).map((student) => (
                <InquiryStudentRow
                  key={student.id}
                  student={student}
                  isSelected={selectedStudentId === student.id}
                  onClick={() => onSelectStudent(student.id)}
                  showClassBadge
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-0.5 p-3">
            {PICKER_GRADES.map((g) => {
              const isGradeExpanded = expandedGrades.has(g);
              return (
                <div key={g}>
                  <div className="flex w-full items-center gap-1 rounded-lg text-sm text-slate-700 transition-all hover:bg-slate-100">
                    <button
                      onClick={() => toggleGrade(g)}
                      className="shrink-0 py-1.5 pl-2 pr-0.5 text-slate-400 hover:text-slate-700"
                      aria-label={isGradeExpanded ? '접기' : '펼치기'}
                    >
                      {isGradeExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => toggleGrade(g)} className="flex-1 py-1.5 pr-2 text-left font-medium">
                      {g}학년
                    </button>
                  </div>
                  {isGradeExpanded && (
                    <ul className="ml-3 mt-0.5 space-y-0.5">
                      {PICKER_CLASSES.map((c) => {
                        const classKey = `${g}-${c}`;
                        const isClassExpanded = expandedClasses.has(classKey);
                        return (
                          <li key={c}>
                            <div className="flex w-full items-center gap-1 rounded-lg text-sm text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800">
                              <button
                                onClick={() => toggleClass(classKey)}
                                className="shrink-0 py-1.5 pl-2 pr-0.5 text-slate-400 hover:text-slate-700"
                                aria-label={isClassExpanded ? '접기' : '펼치기'}
                              >
                                {isClassExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                              <button onClick={() => toggleClass(classKey)} className="flex-1 py-1.5 pr-2 text-left">
                                {g}-{c}반
                              </button>
                            </div>
                            {isClassExpanded && (
                              <StudentClassRoster
                                grade={g}
                                classNum={c}
                                selectedStudentId={selectedStudentId}
                                onSelectStudent={onSelectStudent}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// Edges are inspectable (bottom panel) but not selectable — they no longer
// participate in the analysis source set. Kept the function shape minimal so
// callers only pass what's actually used.
function buildSelectedSources(
  workspace: InquiryWorkspace,
  selectedNodeIds: Set<string>,
  selectedActivityIds: Set<string>,
  relationHints: Map<string, string>
): InquirySelectedSource[] {
  const entityMap = new Map(workspace.kgEntities.map((entity) => [entity.entity_id, entity]));
  const activityMap = new Map(workspace.activityRecords.map((activity) => [activity.id, activity]));

  const sources: InquirySelectedSource[] = [];

  for (const nodeId of selectedNodeIds) {
    const entity = entityMap.get(nodeId);
    if (entity) sources.push(buildSourceFromEntity(entity, relationHints.get(nodeId) ?? null));
  }

  for (const activityId of selectedActivityIds) {
    const activity = activityMap.get(activityId);
    if (activity) sources.push(buildSourceFromActivity(activity));
  }

  return sources;
}

// Stable empty set passed to the graph canvas so it can keep its selectedEdgeIds
// prop contract without ever rendering an "edge selected" visual state. Module-
// level so the reference doesn't change between renders.
const EMPTY_EDGE_SET: Set<string> = new Set();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function propertyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : isRecord(item) ? JSON.stringify(item) : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

// 출처·근거·신뢰도는 전부 `kgProperties`의 정규화 창구로 읽는다. 직접 키를 파면
// 신 KG(§15)에서 조용히 빈 값이 된다 — 업로더가 감싼 properties와 `did`/`layer` 같은
// 다른 키 이름을 그 층이 흡수한다.
function entityEvidence(entity: KgEntityRow): string[] {
  return kgEvidenceList(entity.properties).slice(0, 5);
}

function entitySources(entity: KgEntityRow): Record<string, unknown>[] {
  return kgSourceList(entity.properties).slice(0, 5);
}

function sourceLabel(source: Record<string, unknown>): string {
  return kgSourceLabel(source) || '출처 정보 없음';
}

function relationEvidence(relation: KgRelationRow): string {
  return kgEvidenceList(relation.properties).join(' | ');
}

type GraphDetailSelection = { type: 'entity'; id: string } | { type: 'relation'; id: string } | null;

function selectedEntityRow(workspace: InquiryWorkspace, entityId: string | null): KgEntityRow | null {
  if (!entityId) return null;
  const entityMap = new Map(workspace.kgEntities.map((entity) => [entity.entity_id, entity]));
  return entityMap.get(entityId) ?? null;
}

function selectedRelationRow(workspace: InquiryWorkspace, relationId: string | null): KgRelationRow | null {
  if (!relationId) return null;
  return workspace.kgRelations.find((relation) => relation.id === relationId || kgEdgeId(relation.id) === relationId) ?? null;
}

function relationEndpointLabels(workspace: InquiryWorkspace, relation: KgRelationRow) {
  const entityMap = new Map(workspace.kgEntities.map((entity) => [entity.entity_id, entity]));
  const studentLabel = workspace.student?.name ? `${workspace.student.name} 학생` : '학생';
  const source =
    relation.source_entity_id === 'student'
      ? { label: studentLabel, type: 'Student' }
      : {
        label: entityMap.get(relation.source_entity_id)?.label ?? relation.source_entity_id,
        type: entityMap.get(relation.source_entity_id)?.type ?? 'Entity',
      };
  const target =
    relation.target_entity_id === 'student'
      ? { label: studentLabel, type: 'Student' }
      : {
        label: entityMap.get(relation.target_entity_id)?.label ?? relation.target_entity_id,
        type: entityMap.get(relation.target_entity_id)?.type ?? 'Entity',
      };
  return { source, target };
}

function GraphDetailBottomPanel({
  workspace,
  preview,
  activeDetail,
  onClose,
}: {
  workspace: InquiryWorkspace;
  preview: InquiryAnalysisResult | null;
  activeDetail: GraphDetailSelection;
  onClose: () => void;
}) {
  if (!activeDetail) return null;

  const entity = activeDetail.type === 'entity' ? selectedEntityRow(workspace, activeDetail.id) : null;
  const relation = activeDetail.type === 'relation' ? selectedRelationRow(workspace, activeDetail.id) : null;
  // 기존 KG 에 없는 관계 = 설계가 새로 그린 엣지(저장된 설계 · 아직 저장 전 미리보기).
  // 근거·신뢰도·메모는 생성 스키마의 필수 항목이라 **처음부터 있었다** — 종전에는
  // 이 자리에서 KG 만 뒤져 설계 엣지를 누르면 패널이 조용히 안 떴다.
  const designed =
    activeDetail.type === 'relation' && !relation
      ? resolveDesignedRelation(activeDetail.id, {
        savedDesigns: workspace.savedDesigns,
        preview,
        kgEntities: workspace.kgEntities,
      })
      : null;
  if (!entity && !relation && !designed) return null;

  const evidence = entity ? entityEvidence(entity) : [];
  const sources = entity ? entitySources(entity) : [];
  const entityConfidence = kgConfidence(entity?.properties) ?? Number.NaN;
  const relationConfidence = relation
    ? kgConfidence(relation.properties) ?? Number.NaN
    : designed?.confidence ?? Number.NaN;
  const endpoints = relation
    ? relationEndpointLabels(workspace, relation)
    : designed
      ? { source: designed.source, target: designed.target }
      : null;
  const relationType = relation?.relation_type ?? designed?.relationType ?? '';
  const primaryEvidence = entity ? evidence[0] ?? '' : relation ? relationEvidence(relation) : designed?.evidence ?? '';
  const primarySource = entity ? sources[0] ?? null : null;

  return (
    <aside className="absolute bottom-4 left-1/2 z-30 flex max-h-[28vh] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg transition-transform duration-200">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {entity ? entity.type ?? 'Entity' : 'Relation'}
          </span>
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-950">
            {entity ? entity.label : '관계 세부사항'}
          </h2>
          {entity && Number.isFinite(entityConfidence) && (
            <span className="shrink-0 text-[11px] text-slate-400">신뢰도 {entityConfidence.toFixed(2)}</span>
          )}
          {/* 어느 설계에서 나온 관계인가. 설계 제목은 평균 34자·최대 51자(실측)라
              폭을 막지 않으면 머리글을 통째로 먹는다 — `shrink-0 truncate`는 서로
              모순이라(줄지 않으니 자를 일도 없다) 최대 폭을 주고 나머지는 title 로. */}
          {designed && (
            <span
              className="min-w-0 max-w-[8rem] truncate rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
              title={designed.originLabel}
            >
              {designed.originLabel}
            </span>
          )}
          {!entity && Number.isFinite(relationConfidence) && (
            <span className="shrink-0 text-[11px] text-slate-400">신뢰도 {relationConfidence.toFixed(2)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="세부사항 닫기"
          title="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 py-3 text-xs">
        {entity && (
          <div className="space-y-2">
            <div className="truncate text-[11px] text-slate-500">
              출처: {primarySource ? sourceLabel(primarySource) : '출처 정보 없음'}
            </div>
            <p className="line-clamp-3 leading-relaxed text-slate-700">
              {primaryEvidence || '근거 문장이 없습니다.'}
            </p>
          </div>
        )}

        {endpoints && (
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-1.5 text-slate-700">
              <span className="truncate font-semibold">{endpoints.source.label}</span>
              <span className="shrink-0 text-slate-400">→</span>
              <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {relationType}
              </span>
              <span className="shrink-0 text-slate-400">→</span>
              <span className="truncate font-semibold">{endpoints.target.label}</span>
            </div>
            <p className="line-clamp-3 leading-relaxed text-slate-700">
              {primaryEvidence || '근거 문장이 없습니다.'}
            </p>
            {/* 메모는 근거 문장과 다른 정보다 — 왜 이 연결을 골랐는지를 말한다. */}
            {designed?.notes && (
              <p className="line-clamp-2 leading-relaxed text-[11px] text-slate-500">메모: {designed.notes}</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export function InquiryDesignPage({ academy = false }: { academy?: boolean } = {}) {
  const [interviewOpen, setInterviewOpen] = useState(false);
  const { user, profile, effectiveRole, isStudentView, viewAsStudentId } = useAuth();
  const [worldParams, setWorldParams] = useSearchParams();
  const worldNewsRaw = worldParams.get('worldNews') ?? '';
  const worldNewsId = /^\d+$/.test(worldNewsRaw) && Number.isSafeInteger(Number(worldNewsRaw)) && Number(worldNewsRaw) > 0 ? Number(worldNewsRaw) : null;
  const isNewsPreview = profile?.role === 'admin' && effectiveRole !== 'admin';
  const consumedNewsSeed = useRef<number | null>(null);
  const newsSeedQuery = useQuery({
    queryKey: ['world-today', 'design-seed', user?.id, worldNewsId],
    queryFn: async ({ signal }) => {
      const [article, inquiry] = await Promise.all([fetchWorldArticle(worldNewsId!, signal), fetchNewsInquiry(user!.id, worldNewsId!)]);
      return { article, inquiry };
    },
    enabled: !!worldNewsId && !!user?.id && !isNewsPreview,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selfStudentId = viewAsStudentId || studentEmailId(user?.email);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    isStudentView ? selfStudentId : null
  );
  const [target, setTarget] = useState<InquiryTarget | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  // Per-entity relation verb hint. Map<entity_id, RelationVerb>. Absent key = let
  // the LLM choose. We prune entries whenever the corresponding node is removed
  // from selectedNodeIds, so the map can't accumulate orphaned hints.
  const [relationHints, setRelationHints] = useState<Map<string, string>>(new Map());
  const [activeDetail, setActiveDetail] = useState<GraphDetailSelection>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [isStudentPanelOpen, setStudentPanelOpen] = useState(true);
  // Default closed so the graph canvas gets full room on first render; users
  // open the right-side panel explicitly via the tab buttons.
  const [isDesignPanelOpen, setDesignPanelOpen] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'design' | 'comprehensive' | 'history'>('design');
  // 기본 공급자 = Solar(2026-07-31). 화면의 토글로 OpenAI를 언제든 고를 수 있다.
  const [aiProvider, setAiProvider] = useState<InquiryAiProvider>('openai');
  const [analysis, setAnalysis] = useState<InquiryAnalysisResult | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<InquiryAnalysisResponse | null>(null);
  const [rationale, setRationale] = useState('');
  // Free-form user guidance sent to the LLM alongside sources. Empty string =
  // no extra guidance. Part of the analyze-call cache key so different
  // requirements produce different cache entries.
  const [userRequirements, setUserRequirements] = useState('');
  // ID of the auto-draft row created on the latest successful analyze. Cleared
  // on student switch, after a successful 설계 저장 (which deletes the draft),
  // and on a fresh analyze (each analyze creates a new draft).
  const [draftDesignId, setDraftDesignId] = useState<string | null>(null);
  /**
   * 지금 설계 패널에 열려 있는 **설계 행의 id** (2026-09-18).
   *
   * `draftDesignId` 와 다른 것이다 — 그쪽은 "저장 시 지울 임시 초안"만 담으므로
   * 이력에서 불러온 **정식 설계에는 null** 이다. 성취기준 연결처럼 열려 있는 설계에
   * 무언가를 덧붙이려면 draft 든 saved 든 그 행을 가리킬 수 있어야 한다.
   * 아직 저장되지 않은 결과에서는 null 이고, 그때는 화면 state 에만 남았다가
   * 저장할 때 `llm_result` 와 함께 들어간다.
   */
  const [openDesignId, setOpenDesignId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // 같은 대상·같은 근거로 이미 만들어 둔 설계 — «가져올지 새로 만들지» 확인 대화용.
  // 비어 있으면 대화는 열리지 않고 설계가 바로 진행된다.
  const [priorDesigns, setPriorDesigns] = useState<SavedInquiryDesign[]>([]);
  const [priorPromptOpen, setPriorPromptOpen] = useState(false);
  // 이번 세션에서 낸 의뢰. 완료되면 **자동으로** 설계지에 펼친다 — 남이 낸(또는
  // 지난 방문에 낸) 의뢰까지 자동으로 열면 지금 하던 작업을 덮어쓴다.
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  // 접수 응답을 잃어버렸을 때 같은 의뢰로 재시도하기 위한 멱등 키.
  const requestKeyRef = useRef<string | null>(null);
  // 완료 감지 후 워크스페이스를 **한 번만** 다시 읽기 위한 표시(효과 안에서
  // 조건 없이 invalidate 하면 draft 가 안 보이는 동안 매 렌더마다 왕복한다).
  const refreshedJobsRef = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingRecId, setDeletingRecId] = useState<string | null>(null);
  // 이력에서 "이어서 진행"을 누른 종합 분석 행. 패널이 읽고 나면 스스로 비운다 —
  // 안 비우면 패널 안에서 되돌아가도 같은 행으로 계속 튕긴다.
  const [resumeRecId, setResumeRecId] = useState<string | null>(null);
  /**
   * 성취기준 맥락 사용 여부 (2026-09-12, 시험 단계). **기본 끔** —
   * 켜고 끄며 결과를 견주는 것이 목적이라, 묻지 않고 켜면 비교할 기준선이 사라진다.
   */
  const [useAchievementContext, setUseAchievementContext] = useState(false);
  /**
   * 우측 패널 폭 단계 (2026-09-12 사용자 요청). 1단(430px) / 2단(거의 화면 끝).
   * `localStorage` 에 남긴다 — 화면을 넓게 쓰기로 한 사람은 다음에도 넓게 쓴다.
   * 부팅 경로가 아니라 안전 래퍼 없이 직접 읽어도 되지만, 저장소가 막힌 창에서
   * 접근만으로 던지므로 이 저장소 관례대로 `readStoredJson` 을 쓴다.
   */
  const [panelWidthMode, setPanelWidthMode] = useState<PanelWidthMode>(() =>
    readStoredJson<PanelWidthMode>('inquiry-design-panel-width-v1', 'compact', (v) => v === 'compact' || v === 'wide')
  );
  const togglePanelWidth = () => {
    setPanelWidthMode((current) => {
      const next: PanelWidthMode = current === 'compact' ? 'wide' : 'compact';
      writeStoredJson('inquiry-design-panel-width-v1', next);
      return next;
    });
  };
  // 대화로 설계하기 state. messages stores the full chat history sent to the
  // edge function each turn. The assistant-turn count comes from filtering
  // messages so we don't have a separate source of truth that could drift.
  // conversationSuggestEnd reflects the model's own end suggestion (server
  // sets it to true at turn>=5).
  const [conversationActive, setConversationActive] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<InquiryConversationMessage[]>([]);
  const [conversationSending, setConversationSending] = useState(false);
  const [conversationSuggestEnd, setConversationSuggestEnd] = useState(false);

  useEffect(() => {
    if (isStudentView && selfStudentId) {
      setSelectedStudentId(selfStudentId);
    }
  }, [isStudentView, selfStudentId]);

  // 볼 KG 버전. null이면 최신(=신 파이프라인 KG). 구 버전으로 되돌릴 수 있어야 하므로
  // 화면이 이 상태를 들고 서비스에 넘긴다(§15).
  const [kgVersionId, setKgVersionId] = useState<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: workspaceKey(selectedStudentId, kgVersionId),
    queryFn: () => fetchInquiryWorkspace(selectedStudentId!, kgVersionId),
    enabled: Boolean(selectedStudentId),
    staleTime: 60 * 1000,
  });

  const workspace = workspaceQuery.data;

  // Upfront quota (오늘 N/10) so users — students especially — see the daily
  // budget before spending an analyze call. Superseded by the fresher quota in
  // each analyze response via setQueryData below.
  // 성취기준 맥락 **목차**(제목만). 118건이라 한 번 받아 재사용한다 — 본문은 쓸 때만 받는다.
  const achievementIndexQuery = useQuery({
    queryKey: ['inquiry-design', 'achievement-context-index'],
    queryFn: listAchievementContextIndex,
    staleTime: 30 * 60 * 1000,
  });
  const achievementContext = useMemo(() => {
    if (target?.kind !== 'subject' || !target.name) return null;
    return achievementIndexQuery.data?.get(normalizeSubjectKey(target.name)) ?? null;
  }, [achievementIndexQuery.data, target]);
  /*
   * 맥락이 null 인 **이유**를 패널에 넘긴다 — 로딩 / 조회 실패 / 이 과목엔 원래 없음은
   * 서로 다른 사정인데 종전엔 한 문구로 뭉개져 있었다. 학생 시점에서 RLS 에 막혀
   * 0행이 오던 장애(2026-09-14)가 화면에 전혀 드러나지 않은 것이 그 탓이다.
   */
  const achievementIndexStatus: 'loading' | 'error' | 'ready' =
    achievementIndexQuery.isError ? 'error' : achievementIndexQuery.data ? 'ready' : 'loading';

  // 쿼터 장부가 **작업 큐로 옮겨졌다** (2026-09-18). 종전 `count_inquiry_analysis_calls`
  // 는 LLM 캐시 표의 오늘 행 수였는데, 설계가 큐로 가면 그 표에 행이 생기지 않아
  // 배지가 조용히 0 에 멈춘다. 지금은 오늘 접수한 의뢰 수를 센다.
  const quotaQuery = useQuery({
    queryKey: quotaKey(selectedStudentId),
    queryFn: () => fetchInquiryRequestQuota(selectedStudentId!),
    enabled: Boolean(selectedStudentId),
    staleTime: 30 * 1000,
  });

  // ─── 설계 의뢰(작업 큐) ───────────────────────────────────────────────────
  // 폴링은 **진행 중일 때만** 켠다. 상시 3초 폴링은 이 화면을 열어 두기만 해도
  // 계속 왕복한다(아카데미는 모달이 열려 있는 동안만이라 사정이 다르다).
  const generationQuery = useQuery({
    queryKey: generationKey(user?.id ?? null, selectedStudentId),
    queryFn: () => readInquiryGenerations(user!.id, selectedStudentId!),
    enabled: Boolean(user?.id && selectedStudentId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some(inquiryGenerationActive) ? 3000 : false,
    staleTime: 0,
  });
  const generationJobs = useMemo(() => generationQuery.data ?? [], [generationQuery.data]);
  const activeGeneration = useMemo(
    () => generationJobs.find(inquiryGenerationActive) ?? null,
    [generationJobs]
  );

  // Curriculum subject options for the seed-from-recommendation bridge: lets
  // an anchor_subject resolve to a real enrollment-aware target when possible.
  const curriculumSubjects = useCurriculumSubjects(selectedStudentId);

  // Reset target when switching students.
  useEffect(() => {
    setTarget(null);
    // 버전 id는 학생별이라 그대로 두면 다른 학생의 버전을 가리켜 빈 그래프가 된다.
    setKgVersionId(null);
  }, [selectedStudentId]);

  useEffect(() => {
    setSelectedNodeIds(new Set());
    setSelectedActivityIds(new Set());
    setRelationHints(new Map());
    setActiveDetail(null);
    setAnalysis(null);
    setAnalysisMeta(null);
    setRationale('');
    setUserRequirements('');
    setDraftDesignId(null);
    setOpenDesignId(null);
    setConversationActive(false);
    setConversationMessages([]);
    setConversationSending(false);
    setConversationSuggestEnd(false);
  }, [selectedStudentId]);

  useEffect(() => {
    setAnalysis(null);
    setAnalysisMeta(null);
    setOpenDesignId(null);
  }, [aiProvider]);

  const selectedSources = useMemo(
    () =>
      workspace
        ? buildSelectedSources(workspace, selectedNodeIds, selectedActivityIds, relationHints)
        : [],
    [workspace, selectedNodeIds, selectedActivityIds, relationHints]
  );

  // 뉴스 원문·본인 일지를 설계 요구사항으로 전달한다. 학생 선택 전에는 씨앗을 보존한다.
  useEffect(() => {
    if (isNewsPreview || !worldNewsId || consumedNewsSeed.current === worldNewsId || !newsSeedQuery.data || !workspace) return;
    consumedNewsSeed.current = worldNewsId;
    const { article, inquiry } = newsSeedQuery.data;
    if (article) {
      const block = inquiryToText(article, inquiry ?? EMPTY_INQUIRY);
      setUserRequirements(previous => `${block}\n\n${previous}`.trim().slice(0, INQUIRY_CONTEXT_BUDGET));
      setAnalysisMode('design');
      setDesignPanelOpen(true);
      toast({ title: '관측 일지의 질문과 출처를 가져왔습니다.', description: '대상 과목을 선택하고 탐구 설계를 이어가세요.' });
    } else {
      toast({ title: '지금 열람할 수 없는 소식입니다.', variant: 'destructive' });
    }
    setWorldParams(current => { const next = new URLSearchParams(current); next.delete('worldNews'); return next; }, { replace: true });
  }, [isNewsPreview, worldNewsId, newsSeedQuery.data, workspace, setWorldParams, toast]);

  const toggleNode = useCallback((entityId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
        setActiveDetail((current) => (current?.type === 'entity' && current.id === entityId ? null : current));
        // Removing the node also clears its hint so we don't leak orphaned entries
        // into the next analyze call after the user un-picks an entity.
        setRelationHints((prevHints) => {
          if (!prevHints.has(entityId)) return prevHints;
          const updated = new Map(prevHints);
          updated.delete(entityId);
          return updated;
        });
      } else {
        next.add(entityId);
        setActiveDetail({ type: 'entity', id: entityId });
      }
      return next;
    });
  }, []);

  const setRelationHint = useCallback((entityId: string, verb: string | null) => {
    setRelationHints((prev) => {
      const next = new Map(prev);
      if (verb === null) next.delete(entityId);
      else next.set(entityId, verb);
      return next;
    });
  }, []);

  // Edges are inspect-only: clicking shows the bottom detail panel, clicking
  // the same edge again closes it. No persistent selection state — edges no
  // longer participate in the analysis source set.
  const inspectEdge = useCallback((edgeId: string) => {
    setActiveDetail((current) =>
      current?.type === 'relation' && current.id === edgeId
        ? null
        : { type: 'relation', id: edgeId }
    );
  }, []);

  const toggleActivity = useCallback((activityId: string) => {
    setSelectedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }, []);

  // ─── 추천 → 설계 브리지 ────────────────────────────────────────────────
  // Carry a comprehensive-analysis recommendation into the design tab: the
  // anchor subject becomes the target (enrollment-aware when the curriculum
  // options resolve it), referenced entities become selected graph nodes, and
  // the recommendation text is prepended to the LLM context. Existing manual
  // context is preserved after the seeded block.
  const seedDesignFromRecommendation = useCallback(
    (rec: ComprehensiveRecommendation) => {
      if (!workspace) return;

      const option =
        (curriculumSubjects.data ?? []).find((o) => o.subject === rec.anchor_subject) ?? {
          subject: rec.anchor_subject,
          area: null,
          category: null,
          enrollment: null,
        };
      setTarget(synthesizeTargetFromCurriculum(option, workspace.student?.grade ?? null));

      const entityIds = new Set(workspace.kgEntities.map((entity) => entity.entity_id));
      const seedIds = rec.referenced_entity_ids.filter((id) => entityIds.has(id));
      setSelectedNodeIds(new Set(seedIds));
      setRelationHints(new Map());
      setActiveDetail(seedIds[0] ? { type: 'entity', id: seedIds[0] } : null);

      const block = [
        '[AI 종합 분석 추천 반영]',
        `추천 활동: ${rec.title}`,
        rec.description ? `내용: ${rec.description}` : '',
        rec.rationale ? `추천 근거: ${rec.rationale}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      setUserRequirements((prev) => {
        const merged = prev.trim() ? `${block}\n\n${prev.trim()}` : block;
        return merged.slice(0, INQUIRY_CONTEXT_BUDGET);
      });

      setAnalysisMode('design');
      setDesignPanelOpen(true);
      toast({
        title: '추천을 설계 컨텍스트로 가져왔습니다.',
        description: `대상 과목: ${rec.anchor_subject} · 근거 노드 ${seedIds.length}개 선택됨`,
      });
    },
    [curriculumSubjects.data, toast, workspace]
  );

  // ─── 이어서 작업 (draft/제안/저장본 재개) ──────────────────────────────
  // 이력의 설계를 설계 패널로 복원한다. draft는 자식 source 행이 없어 부모의
  // selected_source_snapshot으로 복원하는데, 활동 스냅샷에는 id가 저장되지
  // 않아 (분류·과목·학년·학기·내용 접두) 매칭으로 최선 복원한다. KG 버전이
  // 바뀌어 사라진 entity는 조용히 건너뛴다.
  const resumeDesign = useCallback(
    (design: SavedInquiryDesign) => {
      if (!workspace) return;

      setTarget({
        id: `resume:${design.id}`,
        kind: design.target_kind,
        name: design.target_name,
        academic_year: design.academic_year,
        grade: design.grade,
        semester: design.semester,
        source: 'resume',
        ref: design.target_ref ?? {},
      });

      const entityIdSet = new Set(workspace.kgEntities.map((entity) => entity.entity_id));
      const nodeIds: string[] = [];
      const hints = new Map<string, string>();
      const activityIds: string[] = [];

      const pushEntity = (entityId: unknown, hint: unknown) => {
        if (typeof entityId !== 'string' || !entityIdSet.has(entityId) || nodeIds.includes(entityId)) return;
        nodeIds.push(entityId);
        if (typeof hint === 'string' && hint) hints.set(entityId, hint);
      };

      if (design.sources.length > 0) {
        for (const source of design.sources) {
          const snapshot = (source.snapshot ?? {}) as Record<string, unknown>;
          if (source.source_kind === 'kg_entity') {
            pushEntity(source.source_entity_id ?? snapshot.entity_id, snapshot.relation_hint);
          } else if (source.source_kind === 'activity_record' && source.activity_id) {
            if (workspace.activityRecords.some((activity) => activity.id === source.activity_id)) {
              activityIds.push(source.activity_id);
            }
          }
        }
      } else {
        for (const raw of design.selected_source_snapshot) {
          if (!raw || typeof raw !== 'object') continue;
          const snap = raw as Record<string, unknown>;
          if (typeof snap.entity_id === 'string') {
            pushEntity(snap.entity_id, snap.relation_hint);
          } else if (typeof snap.content === 'string' && snap.content) {
            const prefix = snap.content.slice(0, 200);
            const match = workspace.activityRecords.find(
              (activity) =>
                (activity.category ?? null) === (snap.category ?? null) &&
                (activity.subject_name ?? null) === (snap.subject_name ?? null) &&
                (activity.grade ?? null) === (snap.grade ?? null) &&
                (activity.semester ?? null) === (snap.semester ?? null) &&
                (activity.content ?? '').startsWith(prefix)
            );
            if (match && !activityIds.includes(match.id)) activityIds.push(match.id);
          }
        }
      }

      setSelectedNodeIds(new Set(nodeIds));
      setSelectedActivityIds(new Set(activityIds));
      setRelationHints(hints);
      setActiveDetail(nodeIds[0] ? { type: 'entity', id: nodeIds[0] } : null);
      setAnalysis(design.llm_result ?? null);
      setAnalysisMeta(null);
      setRationale(design.student_rationale ?? '');
      // draft만 승격 대상 — 저장 시 saveInquiryDesign이 이 draft를 삭제한다.
      setDraftDesignId(design.status === 'draft' ? design.id : null);
      setOpenDesignId(design.id);
      setAnalysisMode('design');
      setDesignPanelOpen(true);
      toast({
        title: '설계를 불러왔습니다.',
        description:
          design.status === 'draft'
            ? '이어서 작업 후 저장하면 임시 분석이 정식 저장으로 승격됩니다.'
            : '내용을 수정하거나 다시 분석해 새 설계로 저장할 수 있습니다.',
      });
    },
    [toast, workspace]
  );

  // ─── 작업 큐 완료 처리 ────────────────────────────────────────────────────
  // 워커가 마지막 단계에서 `student_inquiry_designs` 에 draft 를 넣는다. 그 행은
  // 종전 자동 초안과 **같은 모양**이라 여는 방법도 같다 — `resumeDesign` 하나로
  // 대상·노드 선택·관계 힌트·분석 결과·근거가 한꺼번에 복원된다.

  // 지금 실제로 존재하는 설계 id. 완료된 의뢰 카드가 «열 수 있는 것»만 말하게 하는
  // 근거다(`inquiryGenerationVisible`). `fetchSavedDesigns` 는 status 로 거르지
  // 않으므로 draft 도 여기 들어온다 = 존재 판정에 그대로 쓸 수 있다.
  const savedDesignIds = useMemo(
    () => new Set((workspace?.savedDesigns ?? []).map((design) => design.id)),
    [workspace]
  );

  const openGenerationJob = useCallback(
    (job: InquiryGenerationJob) => {
      if (!workspace || !job.draft_id) return false;
      const draft = workspace.savedDesigns.find((design) => design.id === job.draft_id);
      if (!draft) return false;
      resumeDesign(draft);
      return true;
    },
    [resumeDesign, workspace]
  );

  // 완료된 의뢰가 보이면 워크스페이스를 **한 번** 다시 읽는다(그래야 draft 가 목록에
  // 들어온다). 조건 없이 invalidate 하면 draft 가 오기 전까지 매 렌더마다 왕복한다.
  useEffect(() => {
    if (!selectedStudentId) return;
    const fresh = generationJobs.filter(
      (job) => job.status === 'completed' && job.draft_id && !refreshedJobsRef.current.has(job.id)
    );
    if (fresh.length === 0) return;
    for (const job of fresh) refreshedJobsRef.current.add(job.id);
    void queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
  }, [generationJobs, queryClient, selectedStudentId]);

  // 이번 세션에서 낸 의뢰만 자동으로 펼친다. draft 가 아직 안 보이면 다음 렌더를 기다린다.
  useEffect(() => {
    if (!pendingJobId) return;
    const job = generationJobs.find((candidate) => candidate.id === pendingJobId);
    if (!job) return;
    if (job.status === 'failed') {
      setPendingJobId(null);
      return;
    }
    if (job.status !== 'completed') return;
    if (!openGenerationJob(job)) return;
    setPendingJobId(null);
  }, [generationJobs, openGenerationJob, pendingJobId]);

  // 학생을 바꾸면 이번 세션의 의뢰 추적을 놓는다 — 다른 학생 화면에서 자동으로 펼쳐지면
  // 지금 보고 있는 것을 덮어쓴다.
  useEffect(() => {
    setPendingJobId(null);
    refreshedJobsRef.current = new Set();
  }, [selectedStudentId]);

  const retryGenerationJob = useCallback(
    async (job: InquiryGenerationJob) => {
      setRetryingJobId(job.id);
      try {
        await retryInquiryGeneration(job.id);
        setPendingJobId(job.id);
        await generationQuery.refetch();
        toast({ title: '멈춘 단계부터 다시 시작했습니다.' });
      } catch (error) {
        toast({
          title: '다시 시도하지 못했습니다.',
          description: error instanceof Error ? error.message : '잠시 후 다시 눌러 주세요.',
          variant: 'destructive',
        });
      } finally {
        setRetryingJobId(null);
      }
    },
    [generationQuery, toast]
  );

  // 목록에 초안이 없는 이유는 둘이고 **안내가 정반대**다 — ①완료 직후의 짧은 시차(곧 온다)
  // ②그 사이 초안이 사라졌다(영영 안 온다: 이력에서 삭제됐거나 저장으로 승격돼 정리됐다).
  // 둘을 가르는 방법은 **다시 읽어 보는 것**뿐이라, 종전처럼 무조건 "잠시 후 다시 눌러
  // 주세요"라고 하면 ②인 사용자는 성공할 수 없는 행동을 계속 반복하게 된다.
  // `refetch()` 의 반환값을 쓰는 이유: 클로저의 `workspace` 는 이 시점에 낡았고,
  // `getQueryData` 는 키 모양(버전 포함)을 여기서 다시 맞춰야 해서 조용히 어긋난다.
  const openCompletedGeneration = useCallback(
    async (job: InquiryGenerationJob) => {
      if (openGenerationJob(job)) return;
      const { data } = await workspaceQuery.refetch();
      const draft = data?.savedDesigns.find((design) => design.id === job.draft_id);
      if (draft) {
        resumeDesign(draft);
        return;
      }
      toast({
        title: '이 설계는 더 이상 없습니다.',
        description: '이력에서 삭제됐거나, 저장하면서 임시 초안이 정리됐어요.',
      });
    },
    [openGenerationJob, resumeDesign, toast, workspaceQuery]
  );

  /**
   * 「이 설계가 어느 성취기준에 닿는가」를 짚은 결과를 설계 행에 남긴다 (2026-09-18).
   *
   * 설계 단계와 **분리된 호출**이라(이유는 `services/achievementLinkService.ts`)
   * 성취기준 맥락을 끄고 만든 설계와 과거 이력에도 붙는다. 남기는 자리는
   * `llm_result.achievement_links` — 새 컬럼도 마이그레이션도 없다.
   *
   * 실패를 토스트로 알리지 않는다: 화면은 이미 연결을 보여 주고 있고, 사용자가
   * 할 수 있는 일은 다음에 다시 누르는 것뿐이라 지금 방해할 이유가 없다.
   */
  const persistAchievementLinks = useCallback(
    async (designId: string, llmResult: InquiryAnalysisResult, record: AchievementLinkRecord) => {
      await saveAchievementLinks(designId, llmResult, record);
      await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
    },
    [queryClient, selectedStudentId]
  );

  /**
   * 설계 패널(라이브 결과)에서 짚은 경우.
   *
   * **행이 아직 없을 수 있다** — 막 나온 결과는 저장 전이다. 그때도 화면 state 에는
   * 붙여 두므로, 그대로 저장하면 `llm_result` 에 함께 들어간다(`saveInquiryDesign`
   * 이 `analysis` 를 통째로 싣는다).
   */
  const persistAnalysisAchievementLinks = useCallback(
    async (record: AchievementLinkRecord) => {
      const current = analysis;
      setAnalysis((previous) => (previous ? { ...previous, achievement_links: record } : previous));
      if (!openDesignId || !current) return;
      await persistAchievementLinks(openDesignId, { ...current, achievement_links: record }, record);
    },
    [analysis, openDesignId, persistAchievementLinks]
  );

  // ─── 생명주기 핸들러 (수락·성찰·실행 연결) — 성공 시 true 반환 ─────────
  const acceptProposal = useCallback(
    async (designId: string, rationaleText: string): Promise<boolean> => {
      if (!selectedStudentId) return false;
      try {
        await acceptInquiryProposal(designId, rationaleText);
        await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
        return true;
      } catch (error) {
        toast({
          title: '수락 실패',
          description: error instanceof Error ? error.message : '제안을 수락하지 못했습니다.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [queryClient, selectedStudentId, toast]
  );

  const saveReflection = useCallback(
    async (designId: string, reflection: string): Promise<boolean> => {
      if (!selectedStudentId) return false;
      try {
        await updateInquiryReflection(designId, reflection);
        await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
        toast({ title: '성찰을 저장했습니다.' });
        return true;
      } catch (error) {
        toast({
          title: '성찰 저장 실패',
          description: error instanceof Error ? error.message : '성찰을 저장하지 못했습니다.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [queryClient, selectedStudentId, toast]
  );

  const setObservation = useCallback(
    async (designId: string, activityId: string | null): Promise<boolean> => {
      if (!selectedStudentId) return false;
      try {
        await setInquiryObservation(designId, activityId);
        await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
        toast({
          title: activityId ? '실행 활동을 연결했습니다.' : '실행 연결을 해제했습니다.',
        });
        return true;
      } catch (error) {
        toast({
          title: '실행 연결 실패',
          description: error instanceof Error ? error.message : '실행 활동 연결에 실패했습니다.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [queryClient, selectedStudentId, toast]
  );

  // ─── Conversation handlers (대화로 설계하기) ────────────────────────────
  // Run a short coach-driven chat that helps the student articulate direction
  // before invoking the full analysis. The chat is stateless on the server —
  // we send the full message history each turn. On finish, we summarize the
  // student answers and merge into userRequirements so the existing analyze
  // path picks them up without further changes.
  const assistantTurnCount = useMemo(
    () => conversationMessages.filter((m) => m.role === 'assistant').length,
    [conversationMessages]
  );

  const startConversation = useCallback(async () => {
    if (!target || !selectedStudentId) return;
    setConversationActive(true);
    setConversationMessages([]);
    setConversationSuggestEnd(false);
    setConversationSending(true);
    try {
      // Kick off with a synthetic user opener so the model has something to
      // respond to. The opener references the chosen target so the first
      // question is contextual.
      //
      // ⚠️ opener **본문에는** 고른 노드를 적지 않는다 — 이 메시지는 대화창에
      // 학생의 첫 말풍선으로 그대로 그려진다(`InquiryConversationBox`가
      // `messages`를 전부 렌더한다). 선택 맥락은 `selectedSources`로 넘겨
      // 서비스가 **사본에만** 덧붙이게 한다(`utils/conversationPrimer.ts`).
      const opener: InquiryConversationMessage = {
        role: 'user',
        content: `안녕하세요. "${target.name}" 활동을 위한 새 탐구를 설계하려고 합니다. 방향을 잡는 데 도움을 주세요.`,
      };
      const achievement = await loadSelectedAchievementContext(achievementContext, useAchievementContext);
      const response = await requestInquiryConversation({
        studentId: selectedStudentId,
        aiProvider,
        target,
        messages: [opener],
        turn: 1,
        achievementContext: achievement,
        selectedSources,
        userRequirements,
      });
      setConversationMessages([opener, { role: 'assistant', content: response.reply }]);
      setConversationSuggestEnd(response.suggestEnd);
    } catch (error) {
      void logAiError({
        feature: 'inquiry-design',
        action: 'conversation.start',
        provider: aiProvider,
        studentId: selectedStudentId,
        error,
      });
      toast({
        title: '대화 시작 실패',
        description: error instanceof Error ? error.message : '대화를 시작하지 못했습니다.',
        variant: 'destructive',
      });
      setConversationActive(false);
    } finally {
      setConversationSending(false);
    }
  }, [aiProvider, selectedStudentId, selectedSources, target, toast, userRequirements, achievementContext, useAchievementContext]);

  const sendConversationMessage = useCallback(
    async (userMessage: string) => {
      if (!target || !selectedStudentId) return;
      const trimmed = userMessage.trim();
      if (!trimmed) return;
      const nextMessages: InquiryConversationMessage[] = [
        ...conversationMessages,
        { role: 'user', content: trimmed },
      ];
      setConversationMessages(nextMessages);
      setConversationSending(true);
      try {
        const nextAssistantTurn = assistantTurnCount + 1;
        const achievement = await loadSelectedAchievementContext(achievementContext, useAchievementContext);
        const response = await requestInquiryConversation({
          studentId: selectedStudentId,
          aiProvider,
          target,
          messages: nextMessages,
          turn: nextAssistantTurn,
          achievementContext: achievement,
          // 매 턴 다시 보낸다 — 대화 도중 학생이 별을 더 고르거나 방향을 고쳐
          // 적으면 그 다음 턴부터 코치가 본다(첫 메시지의 사본에만 붙으므로
          // 화면에 보이는 대화 기록은 변하지 않는다).
          selectedSources,
          userRequirements,
        });
        setConversationMessages([
          ...nextMessages,
          { role: 'assistant', content: response.reply },
        ]);
        setConversationSuggestEnd(response.suggestEnd);
      } catch (error) {
        toast({
          title: '대화 응답 실패',
          description: error instanceof Error ? error.message : '대화 응답을 받지 못했습니다.',
          variant: 'destructive',
        });
        // Roll back the optimistic user message so they can try again.
        setConversationMessages(conversationMessages);
      } finally {
        setConversationSending(false);
      }
    },
    [aiProvider, assistantTurnCount, conversationMessages, selectedSources, selectedStudentId, target, toast, userRequirements, achievementContext, useAchievementContext]
  );

  const cancelConversation = useCallback(() => {
    setConversationActive(false);
    setConversationMessages([]);
    setConversationSuggestEnd(false);
    setConversationSending(false);
  }, []);

  // Compress the chat history into a block merged with userRequirements.
  // We strip the synthetic opener (always the first user message) since it's
  // not real input, then bullet the remaining turns.
  //
  // 예산을 넘치면 **오래된 발언부터** 버린다. 구 구현은 `merged.slice(0, 2000)`
  // 이라 뒤에서부터 잘렸는데, 그러면 두 가지가 조용히 사라졌다: ①대화는 뒤로
  // 갈수록 구체적이라 방향이 확정된 마지막 턴이 먼저 날아갔고, ②요약을 앞에
  // 붙이는 구조라 학생이 직접 타이핑한 요구사항이 통째로 증발할 수 있었다.
  // 지키는 우선순위 = 사람이 쓴 글 > 최근 턴 > 오래된 턴.
  const finishConversation = useCallback(() => {
    if (conversationMessages.length === 0) {
      setConversationActive(false);
      return;
    }
    const significantTurns = conversationMessages.slice(1); // drop opener
    if (significantTurns.length === 0) {
      setConversationActive(false);
      return;
    }

    const { text, droppedCount } = buildConversationContext(
      significantTurns,
      userRequirements,
      INQUIRY_CONTEXT_BUDGET
    );

    setUserRequirements(text);
    setConversationActive(false);
    setConversationMessages([]);
    setConversationSuggestEnd(false);
    toast({
      title: '대화 요약을 컨텍스트에 반영했습니다.',
      description: droppedCount > 0
        ? `분량이 많아 앞선 발언 ${droppedCount}개는 생략했습니다. 내용 확인 후 "설계하기"를 눌러주세요.`
        : '내용 확인 후 "설계하기"를 눌러 분석을 진행하세요.',
    });
  }, [conversationMessages, toast, userRequirements]);

  // ─── 설계 실행 ────────────────────────────────────────────────────────────
  // `analyze` 는 **문지기**이고 실제 생성은 `runAnalysis` 다.
  //
  // ⚠️ `analyze` 는 버튼의 `onClick` 에 그대로 걸려 있어 **첫 인자로 MouseEvent 가
  // 들어온다**. 그래서 "확인을 건너뛴다"를 위치 인자(boolean)로 만들면 누를 때마다
  // 참이 되어 확인 대화가 영영 안 뜬다 — 함수를 둘로 가른 이유다.
  //
  // 설계는 **서버 작업 큐**로 간다 (2026-09-18). 종전엔 `openai-proxy` 를 동기로 불러
  // 두 단계 × 최대 110초를 화면을 켜 둔 채 기다려야 했고, 탭을 닫으면 그때까지의
  // 작업이 사라졌다. 이제 접수만 하고 끝낸다 — 워커가 design → graph → save 를
  // 처리하고 완료되면 `student_inquiry_designs` 에 draft 가 생긴다(종전 자동 초안과
  // 같은 자리·같은 모양이라 화면은 기존 `resumeDesign` 으로 그것을 연다).
  const runAnalysis = async () => {
    if (!workspace || !target || !selectedStudentId) return;

    setAnalyzing(true);
    try {
      const achievementBody = await loadSelectedAchievementContext(achievementContext, useAchievementContext);

      // 응답을 잃어버린 뒤 다시 눌러도 같은 키면 서버가 같은 행을 돌려준다 —
      // 접수에 성공해야 비운다(성공 전에 비우면 재시도가 새 의뢰를 만든다).
      requestKeyRef.current ??= crypto.randomUUID();
      const job = await startInquiryGeneration(
        {
          studentId: selectedStudentId,
          // 화면이 **실제로 보고 있던** 버전을 적는다. `kgVersionId` 상태는 "최신"일 때
          // null 이므로 워크스페이스가 푼 값을 쓴다 — null 을 그대로 적으면 나중에
          // 새 버전이 쌓였을 때 "어느 그래프였는지"를 되짚을 수 없다.
          kgVersionId: workspace.kgVersion?.id ?? null,
          target,
          selectedSources,
          userRequirements: userRequirements.trim(),
          ...(achievementBody
            ? { achievementContext: { title: achievementBody.title, body: achievementBody.body } }
            : {}),
        },
        aiProvider,
        requestKeyRef.current,
      );
      requestKeyRef.current = null;

      setPendingJobId(job.id);
      // 이전 결과가 화면에 남아 있으면 "새로 만든 것"과 헷갈린다.
      setAnalysis(null);
      setAnalysisMeta(null);
      setDraftDesignId(null);
      setOpenDesignId(null);
      await Promise.all([
        generationQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: quotaKey(selectedStudentId) }),
      ]);
      toast({
        title: '설계 의뢰를 접수했습니다.',
        description: '이 화면을 닫아도 서버에서 계속 진행돼요. 돌아오면 이어서 볼 수 있습니다.',
      });
    } catch (error) {
      // 실패를 표에 남긴다. 화면의 토스트는 사라지고 엣지 함수 콘솔은 24시간만 남는다 —
      // "언제·어느 모델이" 를 나중에 되짚을 수 있는 자리는 여기뿐이다(프롬프트는 담지 않는다).
      void logAiError({
        feature: 'inquiry-design',
        action: 'generation.start',
        provider: aiProvider,
        studentId: selectedStudentId,
        error,
        detail: {
          targetKind: target?.kind ?? null,
          selectedSources: selectedSources.length,
          useAchievementContext,
        },
      });
      toast({
        title: '설계 의뢰 실패',
        description: error instanceof Error ? error.message : '설계 의뢰를 접수하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // 같은 대상·같은 근거로 이미 만들어 둔 설계가 있으면 **먼저 묻는다** (2026-09-18).
  // 종전엔 서버 LLM 캐시가 같은 조건의 이전 결과를 말없이 돌려줬고(토스트 한 줄),
  // 그때마다 자동 초안이 또 쌓였다. 판정 = `utils/priorDesignMatch.ts`.
  const analyze = () => {
    if (!workspace || !target || !selectedStudentId) return;
    const prior = findPriorDesigns(workspace.savedDesigns, target, selectedSources);
    if (prior.length > 0) {
      setPriorDesigns(prior);
      setPriorPromptOpen(true);
      return;
    }
    void runAnalysis();
  };

  // ⚠️ 이 둘은 `useCallback` 으로 감싸지 않는다 — `runAnalysis` 는 매 렌더 새로
  // 만들어지며 **그 렌더의 상태**(대상·선택 근거·방향)를 닫아 쥔다. 빈 의존성으로
  // 고정하면 첫 렌더의 옛 상태로 설계를 돌리게 되고, 오류 없이 엉뚱한 결과가 나온다.
  const reusePriorDesign = (design: SavedInquiryDesign) => {
    setPriorPromptOpen(false);
    resumeDesign(design);
  };

  const createNewDespitePrior = () => {
    setPriorPromptOpen(false);
    void runAnalysis();
  };

  // 분석 결과 폐기 — 저장(학생) 또는 제안 저장(교사) 전에 이 설계를 쓰지
  // 않기로 결정하는 경로. 세션 화면만 비우며, 워커가 만든 draft는 의도적으로
  // 보존한다(삭제는 분석 이력에서만 — 사용자 정책).
  //
  // 종전엔 "같은 조건으로 다시 분석하면 LLM 캐시 덕에 쿼터 소모 없이 복원된다"가
  // 여기 적혀 있었다. 설계가 작업 큐로 옮겨가며 그 캐시는 더 이상 관여하지 않는다 —
  // 대신 **같은 조건으로 다시 누르면 «이전 설계 가져오기»를 먼저 묻고**(2026-09-18),
  // 가져오기는 이력의 draft 를 그대로 되살리므로 여전히 쿼터를 쓰지 않는다.
  const discardAnalysis = useCallback(() => {
    setAnalysis(null);
    setAnalysisMeta(null);
    setRationale('');
    setDraftDesignId(null);
    setOpenDesignId(null);
    toast({
      title: '이 설계를 사용하지 않기로 했습니다.',
      description: '임시 분석은 분석 이력에 남아 있습니다. 필요하면 이력에서 삭제하거나 다시 불러올 수 있습니다.',
    });
  }, [toast]);

  const save = async () => {
    if (!analysis || !target || !selectedStudentId) return;

    // 학생 본인(또는 admin의 학생 시점 미리보기)의 저장 = 정식 설계(saved).
    // 교사가 학생을 골라 저장하면 '선생님 제안'(proposed)으로 기록되고,
    // 학생이 이력에서 자기 근거를 쓰고 수락해야 saved가 된다.
    const saveStatus: 'saved' | 'proposed' = isStudentView ? 'saved' : 'proposed';

    setSaving(true);
    try {
      await saveInquiryDesign({
        studentId: selectedStudentId,
        target,
        selectedSources,
        analysis,
        rationale,
        tokenUsage: analysisMeta?.tokenUsage as unknown as Record<string, unknown> | undefined,
        draftDesignId,
        kgVersionId: workspace.kgVersion?.id ?? null,
        status: saveStatus,
      });
      await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
      setAnalysis(null);
      setAnalysisMeta(null);
      setRationale('');
      setDraftDesignId(null);
      setOpenDesignId(null);
      toast(
        saveStatus === 'proposed'
          ? {
              title: '학생에게 제안으로 저장했습니다.',
              description: '학생이 자신의 근거를 작성하고 수락하면 정식 설계가 됩니다.',
            }
          : { title: '탐구 설계를 저장했습니다.' }
      );
    } catch (error) {
      toast({
        title: '저장 실패',
        description: error instanceof Error ? error.message : '탐구 설계를 저장하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (designId: string) => {
    if (!selectedStudentId) return;
    if (!window.confirm('이 탐구 설계와 추가 온톨로지 데이터를 삭제할까요?')) return;

    setDeletingId(designId);
    try {
      await deleteInquiryDesign(designId);
      await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
    } catch (error) {
      toast({
        title: '삭제 실패',
        description: error instanceof Error ? error.message : '탐구 설계를 삭제하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const removeComprehensive = async (recommendationId: string) => {
    if (!selectedStudentId) return;
    // 되돌릴 수 없다. 설계 삭제와 같은 수준으로 한 번 묻는다 —
    // 무엇이 사라지는지 말해 준다(보완 방향 목록까지 함께 사라진다).
    if (!window.confirm('이 AI 종합 분석 이력을 삭제할까요? 보완 방향과 추천이 함께 사라지며 되돌릴 수 없습니다.')) return;

    setDeletingRecId(recommendationId);
    try {
      await deleteComprehensiveAnalysis(recommendationId);
      await queryClient.invalidateQueries({ queryKey: workspaceKey(selectedStudentId) });
    } catch (error) {
      toast({
        title: '삭제 실패',
        description: error instanceof Error ? error.message : '이력을 삭제하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setDeletingRecId(null);
    }
  };

  /** 준비 단계 이력을 종합 분석 탭에서 이어서 진행한다. 패널을 열고 그 행을 건넨다. */
  const resumeComprehensive = (recommendationId: string) => {
    setAnalysisMode('comprehensive');
    setDesignPanelOpen(true);
    setResumeRecId(recommendationId);
  };

  // Students can only see their own data — hide the left student-roster panel
  // entirely (regardless of admin previewing as student via isStudentView).
  const canPickStudent =
    !isStudentView && (profile?.role === 'teacher' || profile?.role === 'admin');

  // Auto-close the roster panel when a student is picked so the workspace gets
  // more horizontal room without forcing the user to hit the toggle button.
  const handlePickStudent = (studentId: string | null) => {
    setSelectedStudentId(studentId);
    if (studentId) setStudentPanelOpen(false);
  };

  // 헤더 통합 검색 딥링크 (?student=학생코드): 해당 학생 워크스페이스를 바로 연다
  useStudentDeepLink(useCallback((code: string) => {
    if (isStudentView) return;
    setSelectedStudentId(code);
    setStudentPanelOpen(false);
  }, [isStudentView]));

  // Parallax pixel-star shadow strings — computed once per mount. Counts
  // match the CodePen reference (700/200/100) for a comparable look.
  const starShadows = useMemo(() => ({
    small: buildStarShadows(700, 2000),
    medium: buildStarShadows(200, 2000),
    large: buildStarShadows(100, 2000),
  }), []);

  return (
    <Layout fullWidth>
      <div className={academy ? academyStyles.observatory : 'contents'}>
      {academy && <>
        <AcademyNav />
        <header className={academyStyles.observatoryHeader}>
          <div><h1>별의 연구시설 · 나의 지식 우주</h1><p>망원경 속 별은 나의 지식, 별을 잇는 선은 탐구의 발자취입니다. 별을 골라 새로운 발견을 시작하세요.</p></div>
          <div className={academyStyles.observatoryActions}>
            <button className={academyStyles.primaryButton} disabled={!workspace} onClick={() => { setAnalysisMode('design'); setDesignPanelOpen(true); }}>✦ 새 별 찾기</button>
            <button className={academyStyles.primaryButton} disabled={!workspace} onClick={() => { setAnalysisMode('comprehensive'); setDesignPanelOpen(true); }}>별자리 조언</button>
            <button className={academyStyles.primaryButton} disabled={!workspace?.kgVersion || !workspace?.student} onClick={() => setInterviewOpen(true)}>교수 면담</button>
            <Link to={`/inquiry-design${selectedStudentId ? `?student=${encodeURIComponent(selectedStudentId)}` : ''}`}>기존 탐구 설계 ↗</Link>
          </div>
        </header>
      </>}
      <div className={academy ? academyStyles.telescope : 'contents'}>
      <div className="starfield relative flex h-full min-h-0 overflow-hidden">
        {/* The graph canvas renders its own starfield covering the whole center
            area, so the page-level star layers only paint for the pre-workspace
            states (student not picked / loading / error) — rendering both would
            double the box-shadow star DOM for no visible gain. */}
        {!workspace && (
          <div className="starfield-stage" aria-hidden>
            <div className="starfield-layer starfield-layer--small" style={{ boxShadow: starShadows.small }} />
            <div className="starfield-layer starfield-layer--small starfield-layer--clone" style={{ boxShadow: starShadows.small }} />
            <div className="starfield-layer starfield-layer--medium" style={{ boxShadow: starShadows.medium }} />
            <div className="starfield-layer starfield-layer--medium starfield-layer--clone" style={{ boxShadow: starShadows.medium }} />
            <div className="starfield-layer starfield-layer--large" style={{ boxShadow: starShadows.large }} />
            <div className="starfield-layer starfield-layer--large starfield-layer--clone" style={{ boxShadow: starShadows.large }} />
          </div>
        )}

        {canPickStudent && (
          <>
            <div
              className={cn(
                'absolute left-4 top-4 z-20 h-[calc(100%-2rem)] w-[280px] transition-transform duration-300 ease-in-out',
                isStudentPanelOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-[calc(100%+1rem)]'
              )}
            >
              <StudentPicker selectedStudentId={selectedStudentId} onSelectStudent={handlePickStudent} />
            </div>
            <button
              type="button"
              onClick={() => setStudentPanelOpen((value) => !value)}
              className="absolute top-1/2 z-30 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-slate-200 bg-white text-slate-400 shadow-sm transition-all duration-300 hover:text-brand-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              style={{ left: isStudentPanelOpen ? 296 : 0 }}
              title={isStudentPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
              aria-label={isStudentPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
            >
              {isStudentPanelOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </>
        )}

        <section className="relative min-w-0 flex-1 overflow-hidden">
          {!selectedStudentId && (
            <div className="relative z-10 flex h-full items-center justify-center">
              <div className="rounded-xl border border-brand-400/30 bg-slate-950/70 px-6 py-5 text-center shadow-lg ring-1 ring-inset ring-white/5 backdrop-blur-sm">
                <div className="text-base font-semibold tracking-tight text-slate-100">학생을 선택하세요</div>
                <div className="mt-2 text-sm text-slate-400">탐구 설계는 학생별 최신 지식 그래프를 기준으로 시작합니다.</div>
              </div>
            </div>
          )}

          {selectedStudentId && workspaceQuery.isLoading && (
            <div className="flex h-full items-center justify-center bg-slate-50 text-slate-600">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              탐구 설계 데이터를 불러오는 중
            </div>
          )}

          {selectedStudentId && workspaceQuery.error && (
            <div className="flex h-full items-center justify-center bg-slate-50">
              <div className="rounded-lg border border-red-200 bg-white px-6 py-5 text-center shadow-sm">
                <div className="text-base font-semibold text-red-700">데이터를 불러오지 못했습니다</div>
                <div className="mt-2 text-sm text-slate-600">
                  {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : '알 수 없는 오류'}
                </div>
                <Button className="mt-4" variant="outline" onClick={() => workspaceQuery.refetch()}>
                  다시 시도
                </Button>
              </div>
            </div>
          )}

          {workspace && (
            <>
              <InquiryGraphCanvas
                constellation={academy}
                workspace={workspace}
                savedDesigns={workspace.savedDesigns}
                preview={analysis}
                selectedNodeIds={selectedNodeIds}
                selectedEdgeIds={EMPTY_EDGE_SET}
                onToggleNode={toggleNode}
                onToggleEdge={inspectEdge}
                kgVersionId={kgVersionId}
                onKgVersionChange={setKgVersionId}
              />
              {activeDetail && (
                <GraphDetailBottomPanel
                  workspace={workspace}
                  preview={analysis}
                  activeDetail={activeDetail}
                  onClose={() => setActiveDetail(null)}
                />
              )}
              {/* Mode toggle — always visible at top-center. Clicking opens the
                  panel if it was closed; clicking the active mode closes it.

                  이 화면은 `Layout fullWidth` 라 **헤더가 없다.** 그래서 '사용 방법'을
                  헤더 액션 묶음에 둘 수 없어, 유일한 액션 줄인 이 토글 **왼쪽**에 붙인다
                  (그 버튼 왼쪽에는 아무 버튼도 두지 않는다 — 앱 전역 규약). */}
              {/* 모드 토글은 **패널보다 위**다(`z-50` > 패널 `z-40`).
                  2단으로 넓히면 패널이 가운데를 덮어 이 줄이 가려지는데, 그러면 다른 탭으로
                  가지도 패널을 닫지도 못해 **갇힌다**(이 저장소의 관리자 미리보기 갇힘과 같은 함정).
                  패널 머리글은 제목이 왼쪽·동작이 오른쪽이라 가운데가 비어 있어 겹침이 크지 않다. */}
              <div className={cn('absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-2', academy ? 'top-28 w-max max-w-[calc(100%-1rem)] whitespace-nowrap sm:top-4' : 'top-4')}>
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  title="사용 방법"
                  className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-500 shadow-sm transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">사용 방법</span>
                </button>
              <div className="flex gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (!isDesignPanelOpen) {
                      setAnalysisMode('design');
                      setDesignPanelOpen(true);
                    } else if (analysisMode === 'design') {
                      setDesignPanelOpen(false);
                    } else {
                      setAnalysisMode('design');
                    }
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400',
                    isDesignPanelOpen && analysisMode === 'design'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {academy ? '새 별 찾기' : '탐구 설계'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isDesignPanelOpen) {
                      setAnalysisMode('comprehensive');
                      setDesignPanelOpen(true);
                    } else if (analysisMode === 'comprehensive') {
                      setDesignPanelOpen(false);
                    } else {
                      setAnalysisMode('comprehensive');
                    }
                  }}
                  className={cn(
                    'border-l border-slate-200 px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400',
                    isDesignPanelOpen && analysisMode === 'comprehensive'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {academy ? '별자리 조언' : 'AI 종합 분석'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isDesignPanelOpen) {
                      setAnalysisMode('history');
                      setDesignPanelOpen(true);
                    } else if (analysisMode === 'history') {
                      setDesignPanelOpen(false);
                    } else {
                      setAnalysisMode('history');
                    }
                  }}
                  className={cn(
                    'flex items-center gap-1 border-l border-slate-200 px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400',
                    isDesignPanelOpen && analysisMode === 'history'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                  title="지금까지 분석/저장한 탐구 설계 보기"
                >
                  <History className="h-3.5 w-3.5" />
                  {academy ? '탐구 항해일지' : '분석 이력'}
                </button>
              </div>
              </div>
              {/* 패널 손잡이 묶음 — 폭 조절이 위, 여닫이가 아래.
                  둘 다 패널 바깥 모서리에 붙어야 하므로 `right` 를 공유한다
                  (2단은 `min()`·`calc()` 라 픽셀 숫자로 쓸 수 없어 CSS 문자열이다). */}
              {isDesignPanelOpen && (
                <button
                  type="button"
                  onClick={togglePanelWidth}
                  className="absolute top-1/2 z-40 flex h-10 w-5 -translate-y-[calc(50%+2.75rem)] items-center justify-center rounded-l-lg border border-r-0 border-slate-200 bg-white text-slate-400 shadow-sm transition-all duration-300 hover:text-brand-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  style={{ right: PANEL_HANDLE_RIGHT[panelWidthMode] }}
                  title={panelWidthMode === 'compact' ? '패널 넓게 보기 (2단)' : '패널 좁게 보기 (1단)'}
                  aria-label={panelWidthMode === 'compact' ? '패널 넓게 보기' : '패널 좁게 보기'}
                >
                  {panelWidthMode === 'compact' ? (
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronsRight className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDesignPanelOpen((value) => !value)}
                className="absolute top-1/2 z-40 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-slate-200 bg-white text-slate-400 shadow-sm transition-all duration-300 hover:text-brand-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                style={{ right: isDesignPanelOpen ? PANEL_HANDLE_RIGHT[panelWidthMode] : 0 }}
                title={isDesignPanelOpen ? '패널 숨기기' : '패널 보기'}
                aria-label={isDesignPanelOpen ? '패널 숨기기' : '패널 보기'}
              >
                {isDesignPanelOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
              {/* 세 패널은 **항상 마운트**한다 (2026-09-12 사용자 요청).
                  종전엔 `analysisMode === X && <Panel/>` 라 탭을 바꾸는 순간 언마운트됐고,
                  그때 **진행 중이던 AI 분석의 결과가 갈 곳을 잃었다**(요청은 계속 날아가고
                  응답만 버려진다 — 하루 한도는 이미 차감된 뒤다). 특히 종합 분석은 진행 상태가
                  패널 **안쪽 state** 라 피해가 컸다.
                  숨기기는 `isOpen` 이 맡는다 — 닫힌 패널은 화면 밖으로 밀리고
                  `pointer-events-none` 이 붙어 겹치지 않는다(패널 클래스에 이미 있다).
                  접기·폭 변경은 클래스만 바뀌므로 원래 안전했다. */}
              <InquirySidePanel
                  workspace={workspace}
                  target={target}
                  isOpen={isDesignPanelOpen && analysisMode === 'design'}
                  studentMode={isStudentView}
                  fallbackQuota={quotaQuery.data ?? null}
                  widthMode={panelWidthMode}
                  achievementContext={achievementContext}
                  achievementIndexStatus={achievementIndexStatus}
                  onRetryAchievementIndex={() => void achievementIndexQuery.refetch()}
                  onPersistAchievementLinks={persistAnalysisAchievementLinks}
                  useAchievementContext={useAchievementContext}
                  onUseAchievementContextChange={setUseAchievementContext}
                  aiProvider={aiProvider}
                  onTargetChange={setTarget}
                  onAiProviderChange={setAiProvider}
                  selectedNodeIds={selectedNodeIds}
                  selectedActivityIds={selectedActivityIds}
                  relationHints={relationHints}
                  onSetRelationHint={setRelationHint}
                  onToggleNode={toggleNode}
                  onToggleActivity={toggleActivity}
                  analysis={analysis}
                  analysisMeta={analysisMeta}
                  userRequirements={userRequirements}
                  onUserRequirementsChange={setUserRequirements}
                  rationale={rationale}
                  onRationaleChange={setRationale}
                  analyzing={analyzing}
                  generationActive={Boolean(activeGeneration)}
                  generationSlot={
                    <InquiryGenerationStatus
                      jobs={generationJobs}
                      openedDraftId={draftDesignId}
                      draftIds={savedDesignIds}
                      retryingId={retryingJobId}
                      onOpen={openCompletedGeneration}
                      onRetry={retryGenerationJob}
                    />
                  }
                  saving={saving}
                  onAnalyze={analyze}
                  onSave={save}
                  onDiscardAnalysis={discardAnalysis}
                  conversationActive={conversationActive}
                  conversationMessages={conversationMessages}
                  conversationAssistantTurns={assistantTurnCount}
                  conversationSuggestEnd={conversationSuggestEnd}
                  conversationSending={conversationSending}
                  onStartConversation={startConversation}
                  onSendConversationMessage={sendConversationMessage}
                  onCancelConversation={cancelConversation}
                  onFinishConversation={finishConversation}
                />
              <ComprehensiveAnalysisPanel
                  workspace={workspace}
                  isOpen={isDesignPanelOpen && analysisMode === 'comprehensive'}
                  studentMode={isStudentView}
                  aiProvider={aiProvider}
                  onAiProviderChange={setAiProvider}
                  highlightedEntityIds={selectedNodeIds}
                  onHighlightEntities={(ids) => {
                    setSelectedNodeIds(new Set(ids));
                    setActiveDetail(ids[0] ? { type: 'entity', id: ids[0] } : null);
                  }}
                  onSeedDesign={seedDesignFromRecommendation}
                  widthMode={panelWidthMode}
                  resumeRecommendationId={resumeRecId}
                  onResumed={() => setResumeRecId(null)}
                />
              <HistoryPanel
                  workspace={workspace}
                  isOpen={isDesignPanelOpen && analysisMode === 'history'}
                  studentMode={isStudentView}
                  deletingId={deletingId}
                  onDelete={remove}
                  onSeedDesign={seedDesignFromRecommendation}
                  onResumeComprehensive={resumeComprehensive}
                  onDeleteComprehensive={removeComprehensive}
                  deletingRecId={deletingRecId}
                  widthMode={panelWidthMode}
                  achievementIndex={achievementIndexQuery.data}
                  onPersistAchievementLinks={(design, record) =>
                    design.llm_result
                      ? persistAchievementLinks(design.id, design.llm_result, record)
                      : undefined
                  }
                  onResume={resumeDesign}
                  onAcceptProposal={acceptProposal}
                  onSaveReflection={saveReflection}
                  onSetObservation={setObservation}
                />
            </>
          )}
        </section>
      </div>
      </div>
      </div>
      {academy && workspace?.student && workspace.kgVersion && <ProfessorInterview
        key={`${user?.id}:${effectiveRole}:${workspace.student.id}:${workspace.kgVersion.id}`}
        workspace={workspace} open={interviewOpen} onOpenChange={setInterviewOpen}
        initialSourceId={[...selectedNodeIds].find(id => workspace.kgEntities.some(e => e.entity_id === id && ['Interest', 'Thread', 'Activity'].includes(e.type ?? '')))}
        readOnly={isNewsPreview}
      />}
      <PriorDesignPromptDialog
        designs={priorDesigns}
        open={priorPromptOpen}
        noSelection={selectedSources.length === 0}
        onOpenChange={setPriorPromptOpen}
        onReuse={reusePriorDesign}
        onCreateNew={createNewDespitePrior}
      />
      <InquiryGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </Layout>
  );
}

export default InquiryDesignPage;
