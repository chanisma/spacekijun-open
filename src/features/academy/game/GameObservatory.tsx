import { useAuth } from '@/components/auth/AuthProvider';
import { GenerationBrief } from './GenerationStatus';
import { startGeneration, readGenerations, generationActive, type GenerationJob } from './generationService';
import { sourceStudent } from './experienceService';
import { ResearchProgress, type ResearchPhase } from './ResearchProgress';
import { researchContinuation } from './researchContinuation';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInquiryWorkspace, saveInquiryDesign, buildSourceFromEntity, acceptInquiryProposal, updateInquiryReflection, setInquiryObservation, deleteInquiryDesign } from './experienceService';
import { prepareComprehensiveAnalysis, generateComprehensiveAnalysis, deleteComprehensiveAnalysis } from './experienceService';
import type { InquiryAnalysisResponse, ComprehensivePrepareResponse, ComprehensiveRecommendation, ComprehensiveRecommendationRow, ImprovementDirection, SavedInquiryDesign, InquiryWorkspace } from '@/features/inquiry-design/types';
import type { InquiryConversationMessage } from '@/features/inquiry-design/services/inquiryDesignService';
import type { InquirySelectedSource } from '@/features/inquiry-design/types';
import { designConversationInput, savedDesignConversation } from './designConversationModel';
import { DesignConversation } from './DesignConversation';
import { ResearchDelete } from './ResearchDelete';
import { ScenePanel } from './GameSurface';
import { CharacterPanel } from './CharacterPanel';
import { GameInterview } from './GameInterview';
import { Constellation } from './Constellation';
import { useCurriculumSubjects, synthesizeTargetFromCurriculum, STATUS_LABEL, type CurriculumSubjectStatus } from '@/features/inquiry-design/components/CurriculumSubjectCombobox';
import { listAchievementContextIndex, normalizeSubjectKey, loadSelectedAchievementContext } from '@/features/inquiry-design/services/achievementContextService';
import styles from './game.module.css';
import { libraryContextLabel, researchContextKey, researchContextSource, type ResearchContext } from './newsResearchContext';
// 여기는 `<ol>` 이라 **브라우저가** 번호를 매긴다 — 제목에 실려 온 `1.` 은 그래서 중복이다.
import { planStepTitle } from '@/features/inquiry-design/utils/planSteps';
import { AdviceDirectionCards, AdviceRecommendationCards } from './AdviceCards';
import { JourneyPage } from './JourneyPage';
import { fetchGrowth } from './growthService';
import type { AcademyJourney } from '../../../../supabase/functions/_shared/academyJourney';
import { designTutorialStep, pickTutorialStar, type DesignTutorialTarget } from './designTutorial';

export type ResearchView = 'telescope' | 'design' | 'advice' | 'interview' | 'history';
const viewNames: Record<ResearchView, string> = { telescope: '망원경', design: '새 별 찾기', advice: '별자리 조언', interview: '교수 면담', history: '연구 수첩' };
interface Props { onChapterObserved?: (hasStars: boolean) => Promise<void>; onChapterDesignSaved?: (id: string) => Promise<void>; studentId: string | null; readOnly: boolean; open: boolean; view: ResearchView; onViewChange: (view: ResearchView) => void; onClose: () => void; reduced: boolean; seed: string; seedContext?: ResearchContext | null; onSeedConsumed: () => void;
  /** 리아의 연속 탐구(도서관에서 찾은 질문으로 이어 가는 연구)를 연구 수첩에서 다룬다(2026-10-04) — 제2장을 마친 본인 계정에서만. */ journeyEnabled?: boolean;
  /** 수첩을 열 때 먼저 펼칠 장 — 여정 메뉴·SIDE STORY 가 «연속 탐구» 장으로 연다. */ notebookFocus?: 'journey' | null; onNotebookFocusConsumed?: () => void }

export function GameObservatory({ onChapterObserved, onChapterDesignSaved, studentId, readOnly, open, view, onViewChange, onClose, reduced, seed, seedContext, onSeedConsumed, journeyEnabled = false, notebookFocus = null, onNotebookFocusConsumed }: Props) {
  const cache = useQueryClient();
  const { user, profile } = useAuth();
  // 연속 탐구 — AcademyGame 과 같은 조회 키라 캐시를 나눠 쓴다(어느 쪽에서 바꿔도 함께 갱신).
  const growthQuery = useQuery({ queryKey: ['academy-growth', user?.id], queryFn: () => fetchGrowth(user!.id), enabled: open && !!user?.id && !readOnly && journeyEnabled, retry: 1 });
  const journeyChanged = () => cache.invalidateQueries({ queryKey: ['academy-growth', user?.id] });
  const [aiProvider, setAiProvider] = useState<'openai' | 'solar-pro4'>('openai');
  const jobsQuery = useQuery({ queryKey: ['academy-generation', user?.id], queryFn: () => readGenerations(user!.id), enabled: open && !!user?.id && !readOnly, refetchInterval: 3000 });
  const jobs = useMemo(() => readOnly ? [] : jobsQuery.data ?? [], [readOnly, jobsQuery.data]);
  const activeJob = jobs.find(generationActive);
  const provider = profile?.role === 'admin' ? (activeJob?.provider === 'solar-pro4' ? 'solar-pro4' : activeJob ? 'openai' : aiProvider) : 'openai';
  const [requestedJob, setRequestedJob] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const outfit = useContext(WardrobeContext);
  const [designChatOpen, setDesignChatOpen] = useState(false);
  const [analysisSources, setAnalysisSources] = useState<InquirySelectedSource[]>([]);
  const [paperOpen, setPaperOpen] = useState(true);
  // 제1장 안내 — 학생이 실제로 한 조작(수업 목록 열기·지도 펼치기)을 기억한다. 나머지 단계는 칸을 채우면 저절로 넘어간다.
  const [stageTouched, setStageTouched] = useState(false);
  const [mapOpened, setMapOpened] = useState(false);
  const deskRef = useRef<HTMLDivElement>(null);
  const [guidePointer, setGuidePointer] = useState<{ top: number; left: number } | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const workspaceQuery = useQuery({ queryKey: ['inquiry-design', 'workspace', studentId, version], queryFn: () => fetchInquiryWorkspace(studentId!, version), enabled: open && !!studentId, staleTime: 30_000 });
  const workspace = workspaceQuery.data;
  // 제1장이면 카시안이 별 하나를 골라 둔다 — 학생·KG 버전이 같으면 늘 같은 별(새로고침해도 바뀌지 않는다).
  const tutorial = !!(onChapterObserved || onChapterDesignSaved);
  const tutorialStar = useMemo(() => tutorial && workspace ? pickTutorialStar(workspace.kgEntities, `${studentId ?? ''}:${workspace.kgVersion?.id ?? ''}`) : null, [tutorial, workspace, studentId]);
  const curriculumQuery = useCurriculumSubjects(open ? sourceStudent(studentId) : null);
  const targets = useMemo(() => curriculumQuery.data ? [
    ...curriculumQuery.data.map(option => synthesizeTargetFromCurriculum(option, workspace?.student?.grade ?? null)),
    ...(workspace?.targets ?? []).filter(t => t.kind !== 'subject'),
  ] : workspace?.targets ?? [], [curriculumQuery.data, workspace?.targets, workspace?.student?.grade]);
  const [useAchievementContext, setUseAchievementContext] = useState(false);
  const achievementIndexQuery = useQuery({ queryKey: ['inquiry-design', 'achievement-context-index'], queryFn: listAchievementContextIndex, enabled: open && !!studentId, staleTime: 30 * 60 * 1000 });
  const [selected, setSelected] = useState<string[]>([]);
  const [targetId, setTargetId] = useState('');
  const [requirements, setRequirements] = useState('');
  const [notebookSource, setNotebookSource] = useState<InquirySelectedSource | null>(null);
  const [articleContext, setArticleContext] = useState<ResearchContext | null>(null);
  const [analysis, setAnalysis] = useState<InquiryAnalysisResponse | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');
  const [localBusy, setBusy] = useState('');
  const busy = localBusy || (activeJob ? '교수가 설계도를 준비하고 있어요…' : '');
  const [designProgress, setDesignProgress] = useState<{ phase: ResearchPhase; startedAt: number } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prepared, setPrepared] = useState<ComprehensivePrepareResponse | null>(null);
  const [directions, setDirections] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<ComprehensiveRecommendation[]>([]);
  const [guidance, setGuidance] = useState('');
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (seed && open) { setRequirements(seed.slice(0, 6000)); setArticleContext(seedContext ?? null); setNotebookSource(null); setAnalysis(null); setDraftId(null); onSeedConsumed(); } }, [seed, seedContext, open, onSeedConsumed]);
  const recoveredTarget = jobs.find(j => j.draft_id === draftId)?.input.target;
  const target = recoveredTarget ?? targets.find(t => t.id === targetId) ?? targets[0];
  const achievementContext = target?.kind === 'subject' ? achievementIndexQuery.data?.get(normalizeSubjectKey(target.name)) ?? null : null;
  const sources = useMemo(() => (workspace?.kgEntities ?? []).filter(e => selected.includes(e.entity_id)).slice(0, 12).map(e => buildSourceFromEntity(e)), [workspace?.kgEntities, selected]);
  // 연구대 안내: 망원경에서 고른 별이 재료로 들어온 채 시작한다(한 번만 — 학생이 일부러 뺀 것을 되살리지 않는다).
  const preselected = useRef(false);
  useEffect(() => { if (view === 'design' && onChapterDesignSaved && tutorialStar && !preselected.current && !analysis) { preselected.current = true; setSelected(current => current.length ? current : [tutorialStar.entity_id]); } }, [view, onChapterDesignSaved, tutorialStar, analysis]);
  const designSources = useMemo(() => [...(notebookSource ? [notebookSource] : []), ...(articleContext ? [researchContextSource(articleContext)] : []), ...sources], [notebookSource, articleContext, sources]);
  const refresh = useCallback(() => cache.invalidateQueries({ queryKey: ['inquiry-design', 'workspace', studentId] }), [cache, studentId]);
  async function run(label: string, action: () => Promise<void>) {
    if (readOnly || locked.current || !studentId) return;
    locked.current = true; setBusy(label); setError(''); setNotice('');
    try { await action(); } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '카시안이 기록을 준비하지 못했어요. 다시 시도해 주세요.'); }
    finally { locked.current = false; if (alive.current) { setBusy(''); setDesignProgress(null); } }
  }
  async function analyze(messages: InquiryConversationMessage[] = []) {
    if (!workspace || !target || !studentId) return;
    const { sources: inputSources, context } = designConversationInput(designSources, requirements, messages);
    await run('리아의 질문과 별들을 연결하고 있어요…', async () => {
      const startedAt = Date.now();
      setDesignProgress({ phase: 'context', startedAt });
      const achievement = await loadSelectedAchievementContext(achievementContext, useAchievementContext);
      if (alive.current) setDesignProgress({ phase: 'analysis', startedAt });
      requestKey.current ??= crypto.randomUUID();
      const job = await startGeneration({ studentId, kgVersionId: workspace.kgVersion?.id ?? null, target, selectedSources: inputSources, userRequirements: context, achievementContext: achievement }, provider, requestKey.current);
      requestKey.current = null;
      if (!alive.current) return;
      setRequestedJob(job.id); setAnalysis(null); setDraftId(null);
      await jobsQuery.refetch();
      setNotice('카시안에게 설계 의뢰를 맡겼어요. 다른 곳을 다녀와도 괜찮아요.');
    });
  }
  const openGeneration = useCallback((job: GenerationJob) => {
    if (!job.design || !job.graph || !job.draft_id) return;
    setAiProvider(job.provider === 'solar-pro4' ? 'solar-pro4' : 'openai');
    setVersion(job.input.kgVersionId); setTargetId(job.input.target.id);
    setRequirements(job.input.userRequirements); setAnalysisSources(job.input.selectedSources);
    setAnalysis({ result: { ...job.design, ...job.graph }, tokenUsage: job.usage, cached: false } as unknown as InquiryAnalysisResponse);
    setDraftId(job.draft_id); setRationale(''); setPaperOpen(true); onViewChange('design');
  }, [onViewChange]);
  /** 의뢰에서 펼친 설계도를 접는다 — 초안은 그대로 남아 의뢰 행의 "펼치기" 로 다시 열린다. */
  const closeGeneration = useCallback(() => { setAnalysis(null); setDraftId(null); setRationale(''); }, []);
  useEffect(() => {
    const completed = jobs.find(j => j.id === requestedJob && j.status === 'completed');
    if (!completed) return;
    setRequestedJob(null); openGeneration(completed); void refresh();
  }, [jobs, requestedJob, openGeneration, refresh]);
  useEffect(() => { if (jobs.some(j => j.status === 'completed')) void refresh(); }, [jobs, refresh]);
  function continueResearch(design: SavedInquiryDesign) {
    if (readOnly || locked.current) return;
    const next = researchContinuation(design, targets);
    setNotebookSource(next.source); setArticleContext(null); setSelected([]);
    setTargetId(next.target?.id ?? ''); setRequirements(next.requirements);
    setUseAchievementContext(false); setAnalysis(null); setAnalysisSources([]); setDraftId(null);
    setRationale(''); setDesignChatOpen(false); setPaperOpen(true); setError('');
    setNotice(next.target ? '연구 수첩의 기록을 설계지로 가져왔어요. 다음에 알아보고 싶은 질문이나 활동을 고쳐 적어 보세요.' : '연구 수첩의 기록을 가져왔어요. 이전 수업·활동을 찾을 수 없어, 이번에 탐구할 수업·활동을 확인해 주세요.');
    onViewChange('design');
  }
  function seedRecommendation(rec: ComprehensiveRecommendation) {
    setArticleContext(null); setNotebookSource(null); setPaperOpen(true);
    const match = targets.find(t => t.name === rec.anchor_subject);
    if (match) setTargetId(match.id);
    setSelected(rec.referenced_entity_ids.filter(id => workspace?.kgEntities.some(e => e.entity_id === id)).slice(0, 12));
    setRequirements(`${rec.title}\n${rec.description}\n관심 이유: ${rec.rationale}`.slice(0, 6000));
    setAnalysis(null); setDraftId(null); onViewChange('design');
  }
  /**
   * 연구 수첩의 «별자리 보완 방향» 하나를 담아 새 별 찾기로 (2026-10-04 사용자 요청).
   * 수업 = 그 방향이 권한 수업 중 **그때 내가 고른 수업**을 먼저, 없으면 권한 순서대로 지금 고를 수 있는 첫 수업.
   * 별 = 방향이 근거로 삼은 별(`related_entity_ids`) 중 지금 그래프에 있는 것(최대 12개 — 설계지 상한).
   * 설계지 = 방향의 요약·설명 + 그때 부탁한 점. 수업을 못 찾으면 비워 두고 고르라고 말한다.
   */
  function seedDirection(direction: ImprovementDirection, row: { selected_anchor_subjects?: string[] | null; user_notes?: string | null }) {
    if (readOnly || locked.current) return;
    setArticleContext(null); setNotebookSource(null); setPaperOpen(true); setUseAchievementContext(false);
    const wanted = [...(direction.suggested_anchor_subjects ?? []).filter(s => row.selected_anchor_subjects?.includes(s)), ...(direction.suggested_anchor_subjects ?? [])];
    const match = wanted.map(name => targets.find(t => t.name === name)).find(Boolean);
    setTargetId(match?.id ?? '');
    setSelected((direction.related_entity_ids ?? []).filter(id => workspace?.kgEntities.some(e => e.entity_id === id)).slice(0, 12));
    setRequirements([`보완하고 싶은 방향: ${direction.summary}`, direction.detail, row.user_notes ? `내가 부탁했던 점: ${row.user_notes}` : ''].filter(Boolean).join('\n').slice(0, 6000));
    setAnalysis(null); setAnalysisSources([]); setDraftId(null); setRationale(''); setDesignChatOpen(false); setError('');
    setNotice(match ? `카시안이 짚어 준 «${direction.summary}» 방향을 설계지로 가져왔어요. 알아보고 싶은 질문을 고쳐 적어 보세요.` : `«${direction.summary}» 방향을 설계지로 가져왔어요. 이번에 탐구할 수업·활동을 골라 주세요.`);
    onViewChange('design');
  }
  const guide = view === 'design' && onChapterDesignSaved && workspace?.student ? designTutorialStep({ targetName: target?.name ?? null, starLabel: tutorialStar?.label ?? null, sourceCount: designSources.length, stageTouched, mapOpened, mapOpen: !paperOpen, requirementLength: requirements.trim().length, hasAnalysis: !!analysis, rationaleLength: rationale.trim().length, busy: !!busy }) : null;
  const guideAt = (t: DesignTutorialTarget) => (guide?.target === t ? 'active' : undefined);
  const guideTarget = guide?.target ?? null;
  // 지도를 한 번이라도 펼치면 2단계 완료 — 펼친 동안은 «설계지 펼치기» 버튼을 비춘다.
  useEffect(() => { if (guide && !paperOpen) setMapOpened(true); }, [guide, paperOpen]);
  // 비추는 칸으로 화면을 옮기고 그 옆에 손가락 표시를 둔다 — 설계지는 길어서 칸이 화면 밖에 있을 수 있다.
  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk || !guideTarget) { setGuidePointer(null); return; }
    const el = desk.querySelector<HTMLElement>('[data-guide="active"]');
    if (!el) { setGuidePointer(null); return; }
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    setGuidePointer({ top: Math.max(0, el.offsetTop - 30), left: el.offsetLeft });
  }, [guideTarget, reduced, paperOpen, analysis]);
  if (!open) return null;
  const conversationView = view === 'advice' || view === 'interview';
  const Surface = conversationView ? ProfessorConversation : ScenePanel;
  const graph = workspace && <Constellation key={version ?? 'latest'} workspace={workspace} preview={view === 'design' ? analysis?.result : null} draftId={draftId} highlightNodeId={(view === 'telescope' && onChapterObserved) || (view === 'design' && onChapterDesignSaved) ? tutorialStar?.entity_id ?? null : null} selected={selected} onSelect={ids => { if (view === 'design' && (busy || analysis)) return; setSelected(view === 'design' ? ids.slice(-12) : ids); setAnalysis(null); setDraftId(null); }} version={version} onVersion={id => { if (busy || analysis) return; setVersion(id); setSelected([]); setAnalysis(null); setDraftId(null); setPrepared(null); setRecommendations([]); }} />;

  return <Surface title={`별의 연구시설 · ${viewNames[view]}`} backLabel={view === 'design' || view === 'history' ? '← 연구대로 돌아가기' : undefined} onClose={() => { if (!locked.current) onClose(); }} reduced={reduced} className={`${styles.researchPanel} ${styles[`${view}Scene`]}`}>
    <header className={styles.facilityHeader}><img src={gameAsset(outfit.professor)} alt="카시안 교수" /><div><span className={styles.kicker}>CASSIAN'S OBSERVATORY · 리아의 기록</span><h2>{viewNames[view] === '망원경' ? '내 지식의 우주를 바라보다' : viewNames[view]}</h2><p>“리아, 네가 쌓은 별들 사이에는 아직 발견하지 못한 길이 있단다.”</p></div></header>
    {!studentId ? <p>리아의 별자리는 학생 본인의 기록으로 만들어져요. 학생 계정으로 들어오면 내 탐구를 이어갈 수 있어요. 이 게임에는 다른 학생을 고르는 명단이 없습니다.</p> : workspaceQuery.isPending ? <p role="status">카시안이 리아의 관측 기록을 가져오고 있어요…</p> : workspaceQuery.isError ? <p role="alert">내 별자리를 불러오지 못했어요. <button onClick={() => void workspaceQuery.refetch()}>다시 관측하기</button></p> : !workspace?.student ? <p>이 계정에 연결된 학생 기록을 찾지 못했어요.</p> : <>
      {readOnly && <p className={styles.preview}>학생 시점 열람 · AI 요청과 기록 변경은 학생 본인 계정에서 할 수 있습니다.</p>}
      {view === 'telescope' && <div className={styles.telescopeSky}>{workspace.kgEntities.length ? graph : <div className={styles.readPrompt}><h3>아직 관측된 별이 없어요.</h3><p>리아의 기록이 쌓이면 이 하늘에 별자리가 나타납니다.</p></div>}</div>}
      {view === 'design' && <div className={styles.deskWorkspace} data-paper={paperOpen}><div className={styles.deskMap}>{graph}</div><div className={styles.paperToggleRow}><button className={styles.paperToggle} data-guide={guideAt('mapBack')} onClick={() => setPaperOpen(v => !v)}>{paperOpen ? '설계지 접고 별자리 지도 살펴보기' : '별자리 지도 위에 설계지 펼치기'}</button>{guide?.target === 'mapBack' && <span className={styles.guidePointer} aria-hidden="true">☛ {guide.hint}</span>}</div>
        {/* 지도를 펼치면 설계지(.researchDesk)가 통째로 숨으므로 안내 카드를 지도 위에 따로 띄운다 — 안 그러면 «다 봤으면 돌아오세요»를 읽을 자리가 없다. */}
        {guide && !paperOpen && <div className={`${styles.tutorialGuide} ${styles.mapGuide}`} role="status" aria-label="카시안의 설계지 안내" data-step={guide.index}><span className={styles.kicker}>카시안의 안내 · {guide.index} / {guide.total}</span><strong>{guide.title}</strong><p>{guide.text.replace(/\*\*/g, '')}</p></div>}<div ref={deskRef} className={styles.researchDesk}>
        {guide && guidePointer && <div className={styles.guidePointer} style={guidePointer} aria-hidden="true">☛ {guide.hint}</div>}
        <aside>{guide && <div className={styles.tutorialGuide} role="status" aria-label="카시안의 설계지 안내" data-step={guide.index}><span className={styles.kicker}>카시안의 안내 · {guide.index} / {guide.total}</span><strong>{guide.title}</strong><p>{guide.text.replace(/\*\*/g, '')}</p></div>}
          <span className={styles.kicker}>01 · 탐구가 시작될 무대</span><h3>어디에서 별을 찾아볼까요?</h3><select aria-label="탐구할 수업·활동" data-guide={guideAt('stage')} value={target?.id ?? ''} disabled={!!busy || !!analysis || curriculumQuery.isLoading} onChange={e => { setTargetId(e.target.value); setUseAchievementContext(false); setStageTouched(true); }} onBlur={() => { if (guide?.target === 'stage') setStageTouched(true); }}>{!targets.length && <option value="">연결된 수업·활동이 없어요</option>}{targets.map(t => <option key={t.id} value={t.id}>{t.name} · {t.kind === 'subject' ? STATUS_LABEL[t.ref.enrollment_status as CurriculumSubjectStatus] ?? '이수 정보 없음' : '창체 활동'} · {t.academic_year}년 {t.grade}학년{t.semester ? ` ${t.semester}학기` : ''}</option>)}</select>
          {curriculumQuery.isError && <p role="alert">이수 이력을 불러오지 못했어요. <button onClick={() => void curriculumQuery.refetch()}>다시 불러오기</button></p>}
          <small>이수 중 · 이수 완료 · 앞으로 배정된 과목(편성 확정), 지정·신청 과목을 구분해요. 신청 과목은 개설이 바뀔 수 있어요.</small>
          {target?.kind === 'subject' && <label className={styles.achievementChoice}>과목의 성취기준 맥락<select aria-label="과목의 성취기준 맥락" value={useAchievementContext && achievementContext ? 'on' : 'off'} disabled={!!busy || !!analysis || !achievementContext} onChange={e => setUseAchievementContext(e.target.value === 'on')}><option value="off">사용 안 함</option><option value="on">사용 · 성취기준 참고하기</option></select><small>{achievementIndexQuery.isLoading ? '과목의 참고 자료를 찾고 있어요…' : achievementContext ? `${achievementContext.title} · 탐구 방향을 생각하는 참고로만 사용해요.` : '이 과목에 연결된 성취기준 맥락이 없어요.'}</small></label>}
          <span className={styles.kicker}>02 · 나의 별에서 출발하기</span><p>{sources.length ? `${sources.length}개의 별을 연구 재료로 골랐어요.` : '책상 위 지도에서 재료가 될 별을 고르거나, 새 질문으로 시작해 보세요.'}</p><button className={styles.mapButton} data-guide={guideAt('material')} disabled={!!busy || !!analysis} onClick={() => setPaperOpen(false)}>책상 위 별자리 지도에서 재료 고르기</button>
          <span className={styles.kicker}>03 · 내가 궁금한 것</span><label>교수에게 들려줄 탐구 질문<textarea aria-label="새 별을 찾는 나의 질문" data-guide={guideAt('question')} value={requirements} maxLength={6000} disabled={!!busy || !!analysis} onChange={e => setRequirements(e.target.value)} placeholder="예: 비가 온 뒤 우리 동네 하천의 수질은 어떻게 달라질까요? 실험으로 수질을 비교하고 보고서로 정리하고 싶어요. 보고서 작성·발표·실험 등 어떤 형태의 활동을 해 보고 싶은지도 함께 적어 주세요. 아직 질문이나 활동 방식을 정하지 못했다면 ‘교수와 대화하며 설계하기’로 함께 정해도 좋아요." /></label>{articleContext?.kind === 'academy_library_context' && <div className={styles.newsContextNotice} role="status"><p>▤ 책장 기록의 키워드 «{libraryContextLabel(articleContext)}»{articleContext.year ? ` (${articleContext.year}학년도)` : ''}를 함께 가져왔어요. 선배의 활동이라 교수는 참고 자료로만 읽어요 — 질문 칸에 나의 궁금증을 이어 적어 보세요.</p><button className={styles.textButton} disabled={!!busy || !!analysis} onClick={() => setArticleContext(null)}>책장 기록 빼기</button></div>}
          {articleContext?.kind === 'academy_news_context' && <div className={styles.newsContextNotice} role="status"><p>✉ {articleContext.summary ? '기사 요약과 관측 일지가 함께 도착했어요. 교수도 참고하며 설계해요.' : '기사 정보와 관측 일지가 함께 도착했어요. 이 기사에는 저장된 요약이 없어요.'}</p><button className={styles.textButton} disabled={!!busy || !!analysis} onClick={() => setArticleContext(null)}>기사 참고 자료 빼기</button></div>}
          {notebookSource && <div className={styles.newsContextNotice}><p>✦ 연구 수첩 · {String(notebookSource.snapshot.label)}<br />이전 설계와 성찰을 교수에게 함께 전달해요. 원래 기록은 남겨 두고 새 탐구로 이어가요.</p><button className={styles.textButton} disabled={!!busy || !!analysis} onClick={() => setNotebookSource(null)}>수첩 참고 자료 빼기</button></div>}
          {profile?.role === 'admin' && <label className={styles.achievementChoice}>관리자 · 설계 AI<select aria-label="관리자 설계 모델" value={provider} disabled={!!busy || !!analysis || readOnly} onChange={e => setAiProvider(e.target.value as 'openai' | 'solar-pro4')}><option value="openai">루나 · 기본</option><option value="solar-pro4">Solar Pro 4</option></select></label>}
          <div className={styles.designMethods} aria-label="탐구 설계 방법 선택" data-guide={guideAt('build')}>
            <button className={styles.professorDesignButton} disabled={readOnly || !!busy || !target || !!analysis || curriculumQuery.isLoading || (!designSources.length && !requirements.trim())} onClick={() => void analyze()}>교수와 새로운 별의 설계도 만들기</button>
            <button className={styles.professorDesignButton} disabled={readOnly || !!busy || !target || !!analysis || curriculumQuery.isLoading} onClick={() => setDesignChatOpen(true)}>교수와 대화하며 설계하기</button>
          </div><p className={styles.professorDesignHint}>적은 질문으로 설계도를 만들거나, 교수와 대화를 나눈 뒤 설계할 수 있어요.</p>
        </aside>
        <section>{!analysis ? <div className={styles.professorSpeech}><p>“선택한 별들을 네 질문과 연결해 볼게. 어떤 관찰을 하고, 어떤 근거를 모을지 함께 생각해 보자.”</p></div> : <><AnalysisPages analysis={analysis.result} /><label>이 탐구를 선택한 나의 이유<textarea aria-label="탐구를 선택한 나의 이유" data-guide={guideAt('rationale')} value={rationale} disabled={!!busy} maxLength={4000} onChange={e => setRationale(e.target.value)} /></label><button className={styles.goldButton} data-guide={guideAt('confirm')} disabled={readOnly || !!busy || rationale.trim().length < 10} onClick={() => void run('새 별의 설계도를 연구 수첩에 보관하고 있어요…', async () => {
            if (!target || !studentId) return;
            const savedId = await saveInquiryDesign({ studentId, target, selectedSources: analysisSources, analysis: analysis.result, rationale, tokenUsage: analysis.tokenUsage as unknown as Record<string, unknown>, draftDesignId: draftId, kgVersionId: workspace.kgVersion?.id ?? null, status: 'saved' });
            await refresh(); if (!alive.current) return; setAnalysis(null); setDraftId(null); setNotice('리아의 탐구 설계가 확정됐어요. 연구 수첩에서 다시 펼칠 수 있어요.'); onViewChange('history');
            await onChapterDesignSaved?.(savedId);
          })}>나의 이유와 함께 탐구 확정하기 ✦</button><small>선택한 이유를 10자 이상 적어 주세요.</small><button className={styles.textButton} disabled={!!busy} onClick={() => { setAnalysis(null); setDraftId(null); }}>다른 방향으로 다시 생각하기</button>{draftId && <button className={styles.textButton} disabled={!!busy} onClick={closeGeneration}>설계도 접기 · 나중에 다시 펼치기</button>}</>}</section>
      </div>
      {!readOnly && !localBusy && <GenerationBrief jobs={jobs.filter(j => j.status !== 'completed' || workspace.savedDesigns.some(d => d.id === j.draft_id && d.status === 'draft'))} error={jobsQuery.isError} openedDraftId={analysis ? draftId : null} onRetryRead={() => void jobsQuery.refetch()} onRefresh={jobsQuery.refetch} onOpen={openGeneration} onClose={closeGeneration} />}</div>}
      {view === 'design' && target && <DesignConversation aiProvider={provider} key={`${studentId}:${version}:${target.id}:${selected.join(',')}:${requirements}:${useAchievementContext}:${researchContextKey(articleContext)}:${notebookSource?.snapshot.design_id ?? ''}`} open={designChatOpen && !analysis} studentId={studentId} target={target} sources={designSources} requirements={requirements} achievementContext={useAchievementContext ? achievementContext : null} readOnly={readOnly} reduced={reduced} onClose={() => setDesignChatOpen(false)} onFinish={messages => { setDesignChatOpen(false); void analyze(messages); }} />}
      {view === 'advice' && <section className={styles.adviceChamber}>
        <div className={styles.professorSpeech}><p>“별 하나뿐 아니라 네 우주 전체를 살펴보자. 이어지지 못한 관심사, 더 깊게 탐구할 길을 함께 찾을 수 있을 거야.”</p></div>
        <label>내 별자리에서 함께 살펴보고 싶은 점<textarea aria-label="교수에게 부탁할 별자리 조언" value={guidance} disabled={!!busy} maxLength={2000} onChange={e => setGuidance(e.target.value)} /></label>
        <button className={styles.goldButton} disabled={readOnly || !!busy || !workspace.kgVersion} onClick={() => void run('카시안이 별자리 전체를 관측하고 있어요…', async () => {
          const result = await prepareComprehensiveAnalysis({ studentId, kgVersionId: workspace.kgVersion?.id, currentGrade: workspace.student?.grade ?? undefined, userGuidance: guidance, aiProvider: provider });
          if (!alive.current) return; setPrepared(result); setRecommendations([]); setDirections(result.directions.slice(0, 3).map(d => d.id)); setSubjects([...new Set(result.directions.slice(0, 3).flatMap(d => d.suggested_anchor_subjects))]); await refresh();
        })}>{prepared ? '별자리 전체 다시 관측하기' : '교수에게 내 별자리 전체의 조언 듣기'}</button>
        {prepared && <><h3>어떤 방향으로 더 자라고 싶나요?</h3><div className={styles.directionCards}>{prepared.directions.map(d => <label key={d.id}><input type="checkbox" checked={directions.includes(d.id)} disabled={!!busy} onChange={e => setDirections(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))} /><strong>{d.summary}</strong><p>{d.detail}</p></label>)}</div><h3>연결해 보고 싶은 수업</h3><div className={styles.evidenceChoices}>{[...new Set([...prepared.enrolledSubjects.map(s => s.subject_name), ...prepared.directions.flatMap(d => d.suggested_anchor_subjects)])].map(subject => <label key={subject}><input type="checkbox" checked={subjects.includes(subject)} disabled={!!busy} onChange={e => setSubjects(values => e.target.checked ? [...values, subject] : values.filter(v => v !== subject))} />{subject}</label>)}</div><button className={styles.goldButton} disabled={readOnly || !!busy || !directions.length || !subjects.length} onClick={() => void run('카시안이 다음 탐구의 길을 그려 주고 있어요…', async () => { const result = await generateComprehensiveAnalysis({ recommendationId: prepared.recommendationId, selectedWeaknessIds: directions, selectedAnchorSubjects: subjects, userNotes: guidance, aiProvider: provider }); if (!alive.current) return; setRecommendations(result.recommendations); await refresh(); })}>선택한 방향에서 다음 탐구의 길 찾기</button></>}
        <AdviceRecommendationCards recommendations={recommendations} onSeed={seedRecommendation} />
      </section>}
      {view === 'interview' && <GameInterview key={`${studentId}:${workspace.kgVersion?.id}`} workspace={workspace} initialSourceId={selected.find(id => workspace.kgEntities.some(e => e.entity_id === id && ['Interest', 'Thread', 'Activity'].includes(e.type ?? '')))} readOnly={readOnly} />}
      {view === 'history' && <ResearchNotebook workspace={workspace} readOnly={readOnly} onSaved={refresh} onContinue={continueResearch} onSeedRecommendation={seedRecommendation} onSeedDirection={seedDirection} onNew={() => onViewChange('design')}
        journey={growthQuery.data?.journey ?? null} journeyEnabled={journeyEnabled && !readOnly} journeyLoading={growthQuery.isPending && journeyEnabled && !readOnly} onJourneyChanged={journeyChanged} focus={notebookFocus} onFocusConsumed={onNotebookFocusConsumed} />}
    </>}
    {view === 'telescope' && !readOnly && onChapterObserved && workspace?.student && <div className={styles.tutorialGuide} role="status" aria-label="카시안의 망원경 안내">
      <span className={styles.kicker}>카시안의 첫 수업 · 망원경</span>
      {tutorialStar ? <><strong>내가 별 하나를 골라 두었단다 — 「{tutorialStar.label}」</strong><p>{selected.includes(tutorialStar.entity_id) ? '그 별을 눌렀구나. 오른쪽 아래에 펼쳐진 기록을 읽어 본 뒤 이야기를 이어가자.' : '하늘에서 노랗게 빛나는 그 별을 찾아 눌러 보렴. 누르면 오른쪽 아래에 그 별의 기록이 펼쳐진단다. 안 보이면 왼쪽 위 검색창에 이름을 적어도 좋아.'}</p></> : <><strong>지금은 빈 하늘이구나.</strong><p>기록이 없어도 괜찮아. 첫 질문으로 새로운 별을 찾을 수 있단다.</p></>}
      <button className={styles.mapButton} disabled={!!busy || (!!tutorialStar && !selected.includes(tutorialStar.entity_id))} onClick={() => void run('관측한 장면에 책갈피를 남기고 있어요…', () => onChapterObserved(workspace.kgEntities.length > 0))}>{tutorialStar ? '나의 별을 발견했어요 · 이야기 이어가기' : '첫 별을 찾고 싶어요 · 이야기 이어가기'}</button>
    </div>}
    {localBusy && <div className={styles.researchWaiting} role="status"><span>✧</span>{designProgress ? <ResearchProgress {...designProgress} /> : <p>{busy}</p>}<small>“서로 멀리 있는 별도, 같은 질문으로 이어질 수 있단다. 조금만 기다려 주겠니?”</small></div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
  </Surface>;
}

function AnalysisPages({ analysis }: { analysis: NonNullable<SavedInquiryDesign['llm_result']> }) {
  return <div className={styles.analysisPages}><span className={styles.kicker}>A NEW STAR · 탐구 설계도</span><h3>{analysis.title}</h3><p>{analysis.summary}</p><h4>발견하고 싶은 것</h4>{analysis.inquiry_questions.map((q, i) => <p key={i}>✧ {q}</p>)}<h4>탐구를 이어갈 순서</h4><ol>{analysis.plan_steps.map((s, i) => <li key={i}><strong>{planStepTitle(s.title, i)}</strong><p>{s.method}</p><small>남길 기록: {s.output} · 확인할 근거: {s.expected_evidence}</small></li>)}</ol>{analysis.student_prompt_questions.map((q, i) => <p key={i}>카시안의 질문 · {q}</p>)}{!!analysis.risk_flags.length && <details><summary>탐구 전에 살펴볼 점</summary>{analysis.risk_flags.map((x, i) => <p key={i}>{x}</p>)}</details>}</div>;
}
function ResearchRecord({ design, workspace, readOnly, onSaved, onContinue }: { design: SavedInquiryDesign; workspace: InquiryWorkspace; readOnly: boolean; onSaved: () => Promise<unknown>; onContinue: () => void }) {
  const conversation = savedDesignConversation(design.selected_source_snapshot);
  const [text, setText] = useState(design.status === 'proposed' ? '' : design.reflection ?? '');
  const [activity, setActivity] = useState(design.observed_activity_id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  async function commit(action: () => Promise<unknown>) { if (readOnly || lock.current) return; lock.current = true; setBusy(true); try { await action(); await onSaved(); setMessage('연구 수첩에 기록했어요.'); } catch { setMessage('기록하지 못했어요. 다시 시도해 주세요.'); } finally { setBusy(false); lock.current = false; } }
  const statusNames: Record<string, string> = { draft: '연구 초안', proposed: '선생님이 보내 온 제안', saved: '나의 확정 탐구', observed: '실행 기록과 연결', archived: '보관된 탐구' };
  // 수첩의 오른쪽 쪽 한 장 — 종전엔 접힌 `<details>` 였다(2026-10-03 개편).
  return <article className={`${styles.researchRecord} ${styles.nbEntry}`}><span className={styles.kicker}>A STAR IN MY NOTEBOOK{notebookDay(design.updated_at || design.created_at) ? ' · ' + notebookDay(design.updated_at || design.created_at) : ''}</span><h3>{design.title}</h3><p className={styles.nbStatus} data-tone={design.status}>{statusNames[design.status] ?? design.status}</p>{design.llm_result && <AnalysisPages analysis={design.llm_result} />}<p>내가 선택한 이유 · {design.student_rationale || '아직 적지 않았어요.'}</p><label>{design.status === 'proposed' ? '이 제안을 내 탐구로 받아들이는 이유' : '실행하며 발견한 점과 다음 질문'}<textarea value={text} disabled={readOnly || busy} maxLength={4000} onChange={e => setText(e.target.value)} /></label><button className={styles.goldButton} disabled={readOnly || busy || (design.status === 'proposed' && text.trim().length < 20)} onClick={() => void commit(() => design.status === 'proposed' ? acceptInquiryProposal(design.id, text) : updateInquiryReflection(design.id, text))}>{design.status === 'proposed' ? '내 이유로 제안 수락하기' : '나의 성찰 기록하기'}</button>
    {['saved', 'observed'].includes(design.status) && <><label>실제로 실행한 내 활동 연결<select aria-label={`${design.title}의 실행 활동`} value={activity} disabled={readOnly || busy} onChange={e => setActivity(e.target.value)}><option value="">연결하지 않음</option>{workspace.activityRecords.map(a => <option key={a.id} value={a.id}>{a.subject_name || a.category || '활동'} · {a.content?.slice(0, 70)}</option>)}</select></label><button className={styles.mapButton} disabled={readOnly || busy} onClick={() => void commit(() => setInquiryObservation(design.id, activity || null))}>실행 활동 연결 보관하기</button></>}
    {!!conversation.length && <details><summary>교수와 나눈 설계 대화 펼치기</summary>{conversation.map((turn, i) => <p key={i}><strong>{turn.role === 'user' ? '리아' : '카시안'}</strong> · {turn.content}</p>)}</details>}
    {!readOnly && <button className={styles.goldButton} disabled={busy} onClick={onContinue}>새 별 찾기에서 이어가기</button>}
    {!readOnly && <ResearchDelete label="탐구 기록" disabled={busy} onDelete={async () => { await deleteInquiryDesign(design.id); }} onDeleted={onSaved} />}
    {message && <p role="status">{message}</p>}
  </article>;
}
function ProfessorConversation(props: { title: string; onClose: () => void; reduced?: boolean; className?: string; backLabel?: string; children: import('react').ReactNode }) {
  return <CharacterPanel {...props} npc="professor" />;
}

/**
 * 리아의 연구 수첩 (2026-10-03 개편 — 크림 종이 한 장에 접힌 줄 → 펼친 자주 가죽 수첩).
 * 연구대 그림 위의 보라색 가죽 수첩을 그대로 펼친 모양이다:
 *   왼쪽 쪽 = 목차(탐구 설계 · 교수의 별자리 조언) — 항목마다 상태 인장, 누르면 오른쪽 쪽이 바뀐다.
 *   오른쪽 쪽 = 고른 기록 한 장(설계도·나의 이유·성찰·실행 활동·설계 대화·이어가기·지우기).
 * 종전 `<details>` 묶음은 펼치기 전엔 제목만 보여 «수첩에 무엇이 쌓였는지»를 말하지 못했고, 아래 절반이 늘 비었다.
 */
/** 날짜가 없거나 깨진 기록은 빈 문자열 — «Invalid Date» 를 수첩에 적지 않는다. */
function notebookDay(iso: string | null | undefined) { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : ''; }
type NotebookPick = { kind: 'design' | 'advice' | 'journey'; id: string } | null;
const JOURNEY_SEAL: Record<string, { label: string; tone: string }> = { seeking: { label: '진행', tone: 'proposed' }, planned: { label: '진행', tone: 'proposed' }, observed: { label: '회고', tone: 'saved' }, completed: { label: '완료', tone: 'observed' } };
const NOTEBOOK_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: '초안', tone: 'draft' }, proposed: { label: '제안', tone: 'proposed' }, saved: { label: '확정', tone: 'saved' },
  observed: { label: '실행', tone: 'observed' }, archived: { label: '보관', tone: 'archived' },
};
function ResearchNotebook({ workspace, readOnly, onSaved, onContinue, onSeedRecommendation, onSeedDirection, onNew, journey, journeyEnabled, journeyLoading, onJourneyChanged, focus, onFocusConsumed }: {
  workspace: InquiryWorkspace; readOnly: boolean; onSaved: () => Promise<unknown>; onContinue: (design: SavedInquiryDesign) => void;
  onSeedRecommendation: (rec: ComprehensiveRecommendation) => void; onNew: () => void;
  onSeedDirection: (direction: ImprovementDirection, row: ComprehensiveRecommendationRow) => void;
  journey: AcademyJourney | null; journeyEnabled: boolean; journeyLoading: boolean; onJourneyChanged: () => Promise<unknown>; focus: 'journey' | null; onFocusConsumed?: () => void;
}) {
  const designs = workspace.savedDesigns;
  const advice = workspace.comprehensiveRecommendations;
  const [pick, setPick] = useState<NotebookPick>(focus === 'journey' && journeyEnabled ? { kind: 'journey', id: 'journey' } : null);
  // 여정 메뉴·SIDE STORY 에서 «연속 탐구» 장으로 열었으면 한 번만 그 장으로 넘기고 신호를 돌려준다(다음에 수첩을 열 땐 평소대로).
  useEffect(() => { if (focus === 'journey' && journeyEnabled) { setPick({ kind: 'journey', id: 'journey' }); onFocusConsumed?.(); } }, [focus, journeyEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const current: NotebookPick = pick && (pick.kind === 'journey' ? journeyEnabled : pick.kind === 'design' ? designs.some(d => d.id === pick.id) : advice.some(a => a.id === pick.id)) ? pick
    : designs[0] ? { kind: 'design', id: designs[0].id } : advice[0] ? { kind: 'advice', id: advice[0].id } : journeyEnabled ? { kind: 'journey', id: 'journey' } : null;
  const journeySeal = journey ? JOURNEY_SEAL[journey.stage] ?? JOURNEY_SEAL.seeking : { label: '시작 전', tone: 'draft' };
  const design = current?.kind === 'design' ? designs.find(d => d.id === current.id) ?? null : null;
  const row = current?.kind === 'advice' ? advice.find(a => a.id === current.id) ?? null : null;
  const day = notebookDay;
  return <div className={styles.notebook}>
    <section className={`${styles.nbPage} ${styles.nbLeft}`} aria-label="연구 수첩 목차">
      <span className={styles.kicker}>RIA'S RESEARCH NOTEBOOK</span>
      <h3>리아의 연구 수첩</h3>
      <p className={styles.nbCount}>탐구 {designs.length} · 조언 {advice.length}{journeyEnabled ? ` · 연속 탐구 ${journey ? 1 : 0}` : ''}</p>
      {journeyEnabled && <><h4 className={styles.nbHeading}>❦ 리아의 연속 탐구</h4>
        <ol className={styles.nbIndex}><li><button type="button" aria-pressed={current?.kind === 'journey'} onClick={() => setPick({ kind: 'journey', id: 'journey' })}>
          <span className={styles.nbSeal} data-tone={journeySeal.tone} aria-hidden="true">{journeySeal.label}</span>
          <span className={styles.nbEntryText}><strong>{journey ? journey.source_question.split('\n')[0] : journeyLoading ? '연속 탐구를 펼치는 중…' : '도서관에서 찾은 질문으로 이어 가기'}</strong><small>{journey ? (journey.stage === 'completed' ? '회고의 별을 밝혔어요' : journey.stage === 'observed' ? '회고를 적을 차례' : '실제로 해 본 활동을 이을 차례') : '질문이 별이 되는 여정'}</small></span>
        </button></li></ol></>}
      <h4 className={styles.nbHeading}>✧ 나의 탐구 설계</h4>
      {designs.length ? <ol className={styles.nbIndex}>{designs.map(d => { const status = NOTEBOOK_STATUS[d.status] ?? { label: d.status, tone: 'draft' };
        return <li key={d.id}><button type="button" aria-pressed={current?.kind === 'design' && current.id === d.id} onClick={() => setPick({ kind: 'design', id: d.id })}>
          <span className={styles.nbSeal} data-tone={status.tone} aria-hidden="true">{status.label}</span>
          <span className={styles.nbEntryText}><strong>{d.title}</strong><small>{[day(d.updated_at || d.created_at), d.target_name].filter(Boolean).join(' · ') || '날짜 미상'}</small></span>
        </button></li>; })}</ol>
        : <p className={styles.nbEmpty}>아직 보관한 설계가 없어요. 연구대에서 나의 첫 탐구를 만들어 보세요.</p>}
      <h4 className={styles.nbHeading}>✦ 교수에게 받은 별자리 조언</h4>
      {advice.length ? <ol className={styles.nbIndex}>{advice.map(a => <li key={a.id}><button type="button" aria-pressed={current?.kind === 'advice' && current.id === a.id} onClick={() => setPick({ kind: 'advice', id: a.id })}>
        <span className={styles.nbSeal} data-tone="advice" aria-hidden="true">조언</span>
        <span className={styles.nbEntryText}><strong>{a.recommendations?.length ? '다음 탐구의 길' : '별자리 보완 방향'}</strong><small>{day(a.prepared_at)}</small></span>
      </button></li>)}</ol> : <p className={styles.nbEmpty}>망원경에서 «별자리 조언»을 들으면 여기에 남아요.</p>}
    </section>
    <section className={`${styles.nbPage} ${styles.nbRight}`} aria-label="연구 수첩 기록">
      {current?.kind === 'journey' ? (journeyLoading ? <p className={styles.nbEmpty} role="status">연속 탐구를 펼치는 중…</p> : <JourneyPage key={journey ? journey.created_at : 'none'} journey={journey} activities={workspace.activityRecords} canStart={journeyEnabled} readOnly={readOnly} onChanged={onJourneyChanged} />)
        : design ? <ResearchRecord key={design.id} design={design} workspace={workspace} readOnly={readOnly} onSaved={onSaved} onContinue={() => onContinue(design)} />
        : row ? <article key={row.id} className={styles.nbEntry}>
          <span className={styles.kicker}>PROFESSOR'S ADVICE{day(row.prepared_at) ? ' · ' + day(row.prepared_at) : ''}</span>
          <h3>{row.recommendations?.length ? '다음 탐구의 길' : '별자리 보완 방향'}</h3>
          {/* 대화(별자리 조언 장면)와 같은 카드로 — 2026-10-04 사용자 요청(수첩은 줄글뿐이었다). 그때 고른 방향·수업에 표시가 남는다. */}
          {row.user_notes && <p className={styles.nbAdviceNote}>내가 부탁한 점 · {row.user_notes}</p>}
          <h4 className={styles.nbHeading}>카시안이 짚어 준 방향</h4>
          <AdviceDirectionCards directions={row.weaknesses} picked={row.selected_weakness_ids ?? undefined} subjects={row.selected_anchor_subjects ?? undefined} onSeed={d => onSeedDirection(d, row)} readOnly={readOnly} />
          {!!row.recommendations?.length && <><h4 className={styles.nbHeading}>다음 탐구의 길</h4><AdviceRecommendationCards recommendations={row.recommendations} onSeed={onSeedRecommendation} seedLabel="연구대에서 이 길 이어가기" readOnly={readOnly} /></>}
          {!readOnly && <ResearchDelete label="별자리 조언" onDelete={() => deleteComprehensiveAnalysis(row.id)} onDeleted={onSaved} />}
        </article>
        : <div className={styles.nbBlank}><span aria-hidden="true">✧</span><p>수첩이 아직 비어 있어요.<br />새 별 찾기에서 첫 탐구를 설계하면 여기에 차곡차곡 쌓여요.</p>{!readOnly && <button className={styles.goldButton} onClick={onNew}>새 별 찾기로 첫 탐구 만들기</button>}</div>}
    </section>
  </div>;
}
