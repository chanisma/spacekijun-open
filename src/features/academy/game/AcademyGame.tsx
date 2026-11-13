import { PostludeScene } from './PostludeScene';
import { writePostlude, type ChapterRecord } from './chapterService';
import { GameSky } from './GameSky';
import { SkyChapterScene } from './SkyChapterScene';
import { skyChapterTitle, skyChapterObjective } from './skyChapterStory';
import { writeSkyChapter, type SkyChapterAction, type SkyPlacement } from './skyService';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, RectangleHorizontal, RectangleVertical, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import type { ScreenOrientationControl } from './useScreenOrientation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useActivityAccess } from '@/features/creative-activities/hooks/useActivityAccess';
import { useCreateProposal } from '@/features/creative-activities/hooks/useActivityProposals';
import { GameProposal } from './GameProposal';
import { Dialogue, type Conversation } from './Dialogue';
import { GameBook } from './GameBook';
import { GameModal } from './GameModal';
import { IllustrationGallery } from './IllustrationGallery';
import { collectIllustrations } from './illustrationCollection';
import { NpcChat } from './NpcChat';
import { GameObservatory, type ResearchView } from './GameObservatory';
import { DailyEncounter } from './DailyEncounter';
import { GameEncouragement } from './GameEncouragement';
import { GameStudyLedger } from './GameStudyLedger';
import { ChapterScene } from './ChapterScene';
import { DormChapterScene } from './DormChapterScene';
import { PostChapterScene } from './PostChapterScene';
import { postChapterObjective, postChapterTitle } from './postChapterStory';
import { writePostChapter, type PostChapterAction } from './chapterService';
import type { ResearchContext } from './newsResearchContext';
import { dormChapterObjective, dormChapterTitle } from './dormChapterStory';
import { writeDormChapter, type DormChapterAction } from './chapterService';
import { chapterObjective } from './chapterStory';
import { LibraryChapterScene, LibraryChapterNote } from './LibraryChapterScene';
import { libraryChapterObjective, libraryChapterTitle } from './libraryChapterStory';
import { ReadingChapterScene } from './ReadingChapterScene';
import { ReadingShelf, type ShelfMode } from './ReadingShelf';
import { readingChapterObjective, readingChapterTitle, type ReadingBeat } from './readingChapterStory';
import { deleteReadingCard, fetchBookRecommendations, saveReadingCard, writeReadingChapter, type ReadingChapterAction } from './readingService';
import type { BookRecommendation, ReadingCardDraft } from './readingModel';
import { fetchChapter, writeChapter, writeLibraryChapter, type LibraryChapterAction, type ChapterAction, type ChapterState } from './chapterService';
import { fetchDailyState } from './dailyService';
import { GamePost } from './GamePost';
import { GameFriends } from './GameFriends';
import { AdminStoryReset } from './AdminStoryReset';
import { FriendRoom } from './FriendRoom';
import { fetchFriends, friendsQueryKey } from './friendsService';
import { GrowthPanel, type GrowthView, type GuideAction } from './GrowthPanel';
import { fetchGrowth } from './growthService';
import { journeyObjectives } from '../../../../supabase/functions/_shared/academyJourney';
import { academyDailyInvitations } from '../../../../supabase/functions/_shared/academyCharacters';
import { gameStudentScope } from './studentScope';
import { type GameProgress } from './progress';
import { fetchGameProgress } from './progressService';
import { hotspots, isGamePlace, placeNames, placeNpcs, npcDetails, withEuro, type Interaction, type Npc, type Place, type WorldBridge } from './world';
import { npcFootPoint, npcHeadPoint } from './worldActors';
import { GameSurfaceContext, SceneReturnContext } from './surfaceContext';
import { ActionScene } from './ActionScene';
import { ResearchTable } from './ResearchTable';
import { AdminPreviewControl } from './AdminPreviewControl';
import { GameTitle } from './GameTitle';
import { GameExitButton } from './GameExitButton';
import { GameDock, type DockItem } from './GameDock';
import { Prologue } from './Prologue';
import { PrologueTheater } from './PrologueTheater';
import { needsPrologue } from './prologueStory';
import { fetchPrologue, savePrologue } from './prologueService';
import { GameRoommate } from './GameRoommate';
import { GameDormitory, type DormView } from './GameDormitory';
import { WIDE_BACKDROP_ASSETS, wideBackdrop } from './wideBackdrops';
import { AcademyLoadingView } from '../AcademyLoadingScreen';
import { fetchDormitory } from './dormitoryService';
import { equipment, seoulDay } from './dormitoryModel';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import styles from './game.module.css';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';
const REDUCED_MOTION_KEY = 'academy-reduced-motion:v1';

export function AcademyGame({ place, orientation: screenControl }: { place: Place; orientation?: ScreenOrientationControl }) {
  const { user, profile, viewAsStudentId } = useAuth();
  const scope = gameStudentScope(profile?.role, user?.email, viewAsStudentId, user?.id);
  const preview = scope.readOnly;
  return <AdventureSession key={`${user?.id}:${preview}:${scope.studentId}`} studentId={scope.studentId} userId={user?.id ?? ''} preview={preview} place={place} screenControl={screenControl} />;
}

function AdventureSession({ place, userId, preview, studentId, screenControl }: { place: Place; userId: string; preview: boolean; studentId: string | null; screenControl?: ScreenOrientationControl }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const requestedWorkshop = searchParams.get('workshop');
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const inventory = useRef<HTMLDetailsElement>(null);
  const [skyFrom, setSkyFrom] = useState<'planner' | null>(null);
  const cache = useQueryClient();
  const [entry, setEntry] = useState<'title' | 'prologue' | 'world'>('title');
  const [prologueReplay, setPrologueReplay] = useState(false);
  /** 프롤로그 영상 극장 — 어디서 열었는지에 따라 끝 카드의 «돌아가기» 문구가 갈린다(2026-10-15). */
  const [film, setFilm] = useState<'title' | 'prologue' | 'world' | null>(null);
  const replayReturn = useRef<'title' | 'world'>('title');
  const prologueKey = ['academy-prologue', userId];
  const bookmark = useQuery({ queryKey: prologueKey, queryFn: () => fetchPrologue(userId), enabled: !!userId && !preview, retry: 1 });
  const dormitory = useQuery({ queryKey: ['academy-dormitory', userId, preview, studentId, seoulDay()], queryFn: () => fetchDormitory(seoulDay(), preview ? studentId : null), enabled: !!userId, refetchInterval: 30 * 60_000, retry: 1 });
  const outfit = useMemo(() => equipment(dormitory.data), [dormitory.data]);
  const queryKey = ['academy-game-progress', userId, preview];
  const daily = useQuery({ queryKey: ['academy-daily', userId], queryFn: fetchDailyState, enabled: !!userId && !preview, refetchInterval: 60_000 });
  const growth = useQuery({ queryKey: ['academy-growth', userId], queryFn: () => fetchGrowth(userId), enabled: !!userId && !preview, retry: 1 });
  const chapterKey = ['academy-chapter', userId, preview, studentId];
  const chapter = useQuery({ queryKey: chapterKey, queryFn: () => fetchChapter(preview ? studentId : null), enabled: !!userId, retry: 1 });
  /**
   * 제1장 **다시 해보기** (2026-10-03). 튜토리얼을 고친 뒤 이미 마친 학생(과 만든 사람)이 다시 볼 길이 없었다.
   * 책갈피를 서버에 쓰지 않는 **연습 진행**: 망원경(5단계)부터 설계 확정(12단계)까지 같은 장면·같은 안내를 지역 상태로 돈다.
   * 실제 완료 여부(`firstComplete`)는 서버 기록으로만 판정하므로 연습 중에도 열린 장소가 닫히지 않는다.
   */
  const [replay1, setReplay1] = useState<ChapterRecord | null>(null);
  const realChapterStep = chapter.data?.chapter?.step ?? 0;
  const chapterStep = replay1?.step ?? realChapterStep;
  const [chapterBusy, setChapterBusy] = useState(false), [chapterError, setChapterError] = useState('');
  const chapterLock = useRef(false);
  const [chapterDestination, setChapterDestination] = useState<Place | null>(null);
  const [discoverySeed, setDiscoverySeed] = useState('');
  const [guideDestination, setGuideDestination] = useState<{ place: Place; action: GuideAction } | null>(null);
  const [dailyDestination, setDailyDestination] = useState<Place | null>(null);
  const [conversationNote, setConversationNote] = useState('');
  const saved = useQuery({ queryKey, queryFn: () => fetchGameProgress(userId), enabled: !!userId && !preview, retry: 1 });
  const progress = preview ? null : saved.data;
  const step = progress?.quest_step;
  const firstStory = !preview && needsPrologue(bookmark.data, !!step);
  const entryLoading = !preview && (saved.isPending || bookmark.isPending || chapter.isPending);
  const entryError = !preview && (saved.isError || bookmark.isError || chapter.isError);
  // 돌린 iframe(가로/세로 바꾸기)과 거기서 돌아온 화면은 이미 세계에 들어와 있던 화면을 다시 띄운 것이다 — 타이틀을 또 보이지 않고 세계로 바로 간다.
  // 프롤로그를 아직 안 봤으면(firstStory) 타이틀에 남긴다(이야기 시작은 사람이 누르는 것).
  useEffect(() => { if (screenControl?.resumeWorld && entry === 'title' && !entryLoading && !entryError && !firstStory) setEntry('world'); }, [screenControl?.resumeWorld, entry, entryLoading, entryError, firstStory]);
  function replayPrologue() {
    replayReturn.current = entry === 'title' ? 'title' : 'world';
    setPrologueReplay(true); setEntry('prologue');
  }
  function finishPrologue() {
    if (prologueReplay) { setEntry(replayReturn.current); return; }
    setEntry('world'); navigate('/academy'); setPanel('chapter');
  }
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [chatNpc, setChatNpc] = useState<Exclude<Npc, 'serin' | 'lamplighter'> | null>(null);
  const [panel, setPanel] = useState<DormView | 'postlude' | 'sky' | 'skyChapter' | 'readingChapter' | 'shelf' | 'illustrations' | 'postChapter' | 'dormChapter' | 'libraryChapter' | 'chapter' | 'study' | 'encouragement' | 'roommate' | 'table' | 'daily' | 'book' | 'journal' | 'map' | 'letters' | 'friends' | 'friendRoom' | 'observations' | ResearchView | GrowthView | null>(null);
  // 별빛 기숙사도 다른 건물처럼 세계 장면이다(2026-10-03 사용자 결정 — 종전엔 도착하면 «기숙사 감상» 전체 화면 패널이 세계를 덮어
  // 기숙사만 화면 맞춤 방식이 달랐다). 공방 배송함 딥링크만 그 화면을 바로 연다.
  useEffect(() => { if (entry === 'world' && place === 'dorm' && requestedWorkshop === 'orders') setPanel(current => current === 'dormChapter' || current === 'skyChapter' ? current : 'shop'); }, [entry, place, requestedWorkshop]);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [newsId, setNewsId] = useState<number | null>(null);
  const [researchSeed, setResearchSeed] = useState('');
  const [researchContext, setResearchContext] = useState<ResearchContext | null>(null);
  const [cinematic, setCinematic] = useState<'telescope' | 'pigeon' | null>(null);
  const [error, setError] = useState('');
  const [proposing, setProposing] = useState(false);
  const access = useActivityAccess();
  const proposal = useCreateProposal();
  const [ready, setReady] = useState(false);
  const [engineError, setEngineError] = useState(false);
  /** 원화를 받는 진행률(0~1, Phaser 로더) — 로딩 화면의 %. */
  const [loadProgress, setLoadProgress] = useState(0);
  /**
   * 처음 장소의 «좌우로 늘린 배경»(넓은 화면에서만 쓴다)도 처음 로딩에 함께 받는다 (2026-10-04 사용자 지적 — 늘린 배경이
   * 원래 배경보다 늦게 떠서 세계가 열린 뒤 양옆이 바뀌었다). 다 받기 전에는 로딩 화면이 남는다. 실패해도 막지 않는다.
   * 나머지 장소의 늘린 배경은 문이 열린 뒤 낮은 우선순위로 미리 받아 둔다 — 장소를 옮길 때 늦게 뜨지 않게.
   */
  const [wideReady, setWideReady] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(min-aspect-ratio: 3/2)').matches) return true;
    return !wideBackdrop(place === 'dorm' ? 'dorm' : place);
  });
  useEffect(() => {
    if (wideReady) return;
    const img = new Image();
    const done = () => setWideReady(true);
    img.addEventListener('load', done); img.addEventListener('error', done);
    img.src = wideBackdrop(place === 'dorm' ? 'dorm' : place)!;
    if (img.complete) done();
    const giveUp = window.setTimeout(done, 15000); // 느린 회선에서 이것 하나 때문에 문이 안 열리지 않게
    return () => { img.removeEventListener('load', done); img.removeEventListener('error', done); window.clearTimeout(giveUp); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 처음 장소 한 번만
  useEffect(() => {
    if (!ready || !window.matchMedia?.('(min-aspect-ratio: 3/2)').matches) return;
    const timer = window.setTimeout(() => {
      for (const asset of WIDE_BACKDROP_ASSETS) { const img = new Image(); img.setAttribute('fetchpriority', 'low'); img.src = wideBackdrop(asset)!; }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [traveling, setTraveling] = useState<Place | null>(null);
  /**
   * 동작 줄이기 — **기본은 애니메이션 켬** (2026-09-14 사용자 결정). 종전엔 OS 의 prefers-reduced-motion 을
   * 초기값으로 읽어 그 설정이 켜진 기기에서는 별 버튼이 처음부터 눌린 채였고, CSS 미디어 쿼리까지 겹쳐
   * 버튼을 꺼도 애니메이션이 살아나지 않았다. 지금은 이 버튼이 유일한 스위치이고 선택은 저장된다.
   */
  const [reduced, setReduced] = useState(() => readStoredString(REDUCED_MOTION_KEY) === 'true');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundContext = useRef<AudioContext | null>(null);
  const world = useRef<WorldBridge | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const initialPlace = useRef(place);
  const initialReduced = useRef(reduced);
  const travelTimer = useRef<number>();
  const sound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const context = soundContext.current ?? (soundContext.current = new AudioContext());
      void context.resume().catch(() => undefined);
      const tone = context.createOscillator(), gain = context.createGain();
      tone.type = 'sine'; tone.frequency.setValueAtTime(660, context.currentTime); tone.frequency.exponentialRampToValueAtTime(440, context.currentTime + .16);
      gain.gain.setValueAtTime(.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .24);
      tone.connect(gain); gain.connect(context.destination); tone.start(); tone.stop(context.currentTime + .25);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    } catch { /* Audio is optional; movement and reading remain available. */ }
  }, [soundEnabled]);
  useEffect(() => () => { window.clearTimeout(travelTimer.current); void soundContext.current?.close(); }, []);
  useEffect(() => { writeStoredString(REDUCED_MOTION_KEY, String(reduced)); }, [reduced]);

  function travel(destination: Place, chapterTravel = false) {
    if (inventory.current) inventory.current.open = false;
    if (traveling) return;
    if (!canEnter(destination, chapterTravel)) return;
    if (destination === 'observatory' && !chapterTravel && !preview && chapter.data && chapterStep < 3) { setGuideDestination(null); setDailyDestination(null); openChapter('plaza'); return; }
    if (destination === place) { setPanel(null); return; }
    setConversation(null); setChatNpc(null); setError(''); sound();
    setTraveling(destination);
    window.clearTimeout(travelTimer.current);
    travelTimer.current = window.setTimeout(() => {
      setPanel(null);
      navigate(destination === 'plaza' ? '/academy' : `/academy/${destination}`);
    }, reduced ? 0 : 650);
  }
  function openChapter(destination: Place = chapterStep < 3 ? 'plaza' : 'observatory') {
    setConversation(null); setChatNpc(null); setChapterError('');
    if (destination === place) setPanel('chapter');
    else { setChapterDestination(destination); travel(destination, true); }
  }
  useEffect(() => { if (chapterDestination === place && !traveling) { setChapterDestination(null); setPanel('chapter'); } }, [chapterDestination, place, traveling]);
  async function commitChapter(action: ChapterAction, designId?: string, hasStars?: boolean) {
    if (preview || chapterLock.current || !chapter.data) return null;
    if (replay1) {
      const step = action === 'arrive' ? 3 : action === 'observe' ? 7 : action === 'desk' ? 11 : action === 'design' ? 12 : replay1.step + 1;
      const next: ChapterRecord = { ...replay1, step, revision: replay1.revision + 1, has_stars: action === 'observe' ? hasStars ?? replay1.has_stars : replay1.has_stars, design_id: designId ?? replay1.design_id };
      // 교수가 설계를 칭찬하는 12단계까지만 — 그 뒤는 완료 보상 장면이라 연습에서는 되풀이하지 않는다.
      if (next.step >= 13) { setReplay1(null); setPanel(null); return null; }
      setReplay1(next);
      return next;
    }
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    const revision = chapter.data.chapter?.revision ?? 0;
    try {
      const result = await writeChapter(action, revision, designId, hasStars);
      cache.setQueryData<ChapterState>(chapterKey, previous => ({ ...previous, chapter: result, designs: previous?.designs ?? [] }));
      if (result.completed_at) void cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
      await cache.invalidateQueries({ queryKey: chapterKey });
      if (result.revision !== revision + 1) { setChapterError('다른 창의 책갈피를 가져왔어요. 현재 장면에서 이어가 주세요.'); return null; }
      return result;
    } catch (e) { setChapterError((e as Error).message); return null; }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }
  async function chapterAction(action: 'arrive' | 'telescope' | 'desk' | 'design') {
    if (action === 'arrive') { if (await commitChapter('arrive')) openChapter('observatory'); }
    else if (action === 'telescope') { setPanel(null); openInstrument('telescope'); }
    else setPanel('table');
  }
  function replayChapter() {
    setReplay1({ step: 5, revision: 0, has_stars: null, design_id: null, design_title: null, started_at: new Date().toISOString(), completed_at: null });
    if (inventory.current) inventory.current.open = false;
    openChapter('observatory');
  }
  async function chapterDesignSaved(id: string) {
    if (chapterStep !== 11 || preview) return;
    await commitChapter('design', id);
    setPanel('chapter');
  }
  const library = chapter.data?.library ?? null;
  const libraryStep = library?.step ?? 0;
  const firstComplete = realChapterStep === 16;
  const libraryComplete = libraryStep === 18;
  const dormChapter = chapter.data?.dorm ?? null, dormStep = dormChapter?.step ?? 0;
  const dormComplete = firstComplete && libraryComplete && dormStep === 36;
  // 별빛 친구 (2026-10-04) — 친구의 기숙사를 방문하는 기능이라 제3장(기숙사 이야기) 뒤에 열린다. 받은 요청 수는 기능 칸의 배지.
  const friends = useQuery({ queryKey: friendsQueryKey(userId), queryFn: fetchFriends, enabled: !!userId && !preview && dormComplete, refetchInterval: 60_000, retry: 1 });
  const [friendVisit, setFriendVisit] = useState<{ id: string; name: string; preview: boolean } | null>(null);
  // 알림의 «친구 목록 열기»(`/academy?friends=1`) — 세계에 들어온 뒤 한 번 연다.
  useEffect(() => {
    if (entry !== 'world' || !searchParams.get('friends') || !dormComplete) return;
    setPanel('friends');
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete('friends'); return next; }, { replace: true });
  }, [entry, searchParams, setSearchParams, dormComplete]);
  const postChapter = chapter.data?.post ?? null, postStep = postChapter?.step ?? 0;
  const postComplete = dormComplete && postStep === 30;
  const skyChapter = chapter.data?.sky ?? null, skyStep = skyChapter?.step ?? 0;
  const skyComplete = postComplete && skyStep === 29;
  /**
   * 제6장 «설명할 수 있을 때까지» (2026-10-03) — 제5장을 마치면 도서관에 세린이 서고, 처음 들어가면 이야기가 시작된다.
   * 책갈피는 `chapter.data.reading`, 설명 카드는 `chapter.data.readingCards`(같은 RPC 가 함께 준다).
   */
  const readingChapter = chapter.data?.reading ?? null, readingStep = readingChapter?.step ?? 0;
  const readingComplete = skyComplete && readingStep === 17;
  const [shelfMode, setShelfMode] = useState<ShelfMode>('browse');
  const [readingDestination, setReadingDestination] = useState<Place | null>(null);
  const readingAutoStarted = useRef(false);
  const books = useQuery({ queryKey: ['academy-books'], queryFn: fetchBookRecommendations, enabled: panel === 'shelf', staleTime: 60 * 60 * 1000 });
  const skyUnlocked = skyStep >= 22;
  const postludeStep = chapter.data?.post?.postlude_step ?? 0;
  const postludeComplete = !!chapter.data?.post?.postlude_completed_at;
  const completedSkyPlans = chapter.data?.skyEligibility?.completed_plans ?? 0;
  const canStartSky = postludeComplete && completedSkyPlans >= 5;
  const waitingForSky = postComplete && !skyChapter;
  const skyWaitingText = !postludeComplete ? '중앙 광장에서 루온과 이야기 나누기' : `한 목표에서 서로 다른 계획 5개 실천 · ${Math.min(5, completedSkyPlans)} / 5`;
  const roommateUnlocked = dormComplete;
  function npcFeaturesUnlocked(npc: Npc) {
    if (npc === 'lamplighter') return false;
    if (npc === 'postmaster') return postComplete;
    return npc === 'librarian' ? firstComplete && libraryComplete
      : npc === 'serin' ? dormComplete : firstComplete;
  }
  const dailyUnlocked = !!daily.data && npcFeaturesUnlocked(daily.data.npc);
  function canEnter(destination: Place, chapterTravel = false) {
    return destination === 'observatory' ? firstComplete || chapterTravel : destination === 'library' ? firstComplete : destination === 'dorm' ? libraryComplete : destination === 'post' ? dormComplete : true;
  }
  function unlockHint(destination: Place) {
    return destination === 'observatory' || destination === 'library' ? '제1장 완료 후 입장' : destination === 'dorm' ? '제2장 완료 후 입장' : destination === 'post' ? '제3장 완료 후 입장' : '';
  }
  // Chapter I's guided visit and saved story resume precede ordinary facility access.
  const guidedResearchVisit = place === 'observatory' && chapterStep >= 3 && !firstComplete;
  const lockedPlace = (!canEnter(place) && !guidedResearchVisit) || (place === 'dorm' && libraryComplete && dormStep < 7);
  useEffect(() => {
    if (chapter.isSuccess && lockedPlace) { setPanel(null); setConversation(null); setChatNpc(null); navigate('/academy', { replace: true }); }
  }, [chapter.isSuccess, lockedPlace, navigate]);
  const journeyProgress: GameProgress | null | undefined = libraryComplete && library ? { user_id: userId, quest_step: 'completed', activity_id: library.activity_id, question: `${library.question}\n궁금해진 이유: ${library.curiosity_reason}`, updated_at: library.completed_at! } : progress;
  const [libraryDestination, setLibraryDestination] = useState<Place | null>(null);
  const libraryAutoStarted = useRef(false);
  function openLibraryChapter(destination: Place = libraryStep < 6 ? 'plaza' : 'library') {
    if (!firstComplete) { openChapter(); return; }
    setConversation(null); setChatNpc(null); setChapterError('');
    if (destination === place) setPanel('libraryChapter');
    else { setLibraryDestination(destination); travel(destination, true); }
  }
  useEffect(() => { if (libraryDestination === place && !traveling) { setLibraryDestination(null); setPanel('libraryChapter'); } }, [libraryDestination, place, traveling]);
  async function commitLibrary(action: LibraryChapterAction, input?: { activityId?: string; question?: string; reason?: string }) {
    if (preview || chapterLock.current || !chapter.data || !firstComplete) return null;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try {
      // A pending Chapter I refresh must not replace the newly created interlude bookmark.
      await cache.cancelQueries({ queryKey: chapterKey });
      const result = await writeLibraryChapter(action, library?.revision ?? 0, input);
      cache.setQueryData<ChapterState>(chapterKey, previous => ({ ...previous!, library: result }));
      if (result.completed_at) void cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
      if (action !== 'start' && result.revision !== (library?.revision ?? 0) + 1) { setPanel('libraryChapter'); setChapterError('다른 창의 책갈피를 가져왔어요. 현재 장면에서 이어가 주세요.'); return null; }
      return result;
    } catch (e) { setChapterError((e as Error).message); return null; }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }
  const startLibraryAutomatically = useRef<() => void>(() => undefined);
  startLibraryAutomatically.current = () => { setConversation(null); setPanel('libraryChapter'); void commitLibrary('start'); };
  useEffect(() => {
    if (entry !== 'world' || preview || place !== 'plaza' || traveling || panel || !firstComplete || library || libraryAutoStarted.current) return;
    libraryAutoStarted.current = true; startLibraryAutomatically.current();
  }, [entry, preview, place, traveling, panel, firstComplete, library]);
  async function libraryAction(action: 'arrive' | 'book' | 'note') {
    if (preview) return;
    if (action === 'arrive') { if (await commitLibrary('arrive')) openLibraryChapter('library'); }
    else if (action === 'book') { if (libraryStep === 12 && !await commitLibrary('next')) return; setReadingId(null); setPanel('book'); }
    else setPanel('journal');
  }

  const [dormDestination, setDormDestination] = useState<Place | null>(null);
  const dormAutoStarted = useRef(false);
  function openDormChapter(destination: Place = dormStep < 7 ? 'plaza' : 'dorm') {
    if (!libraryComplete) { openLibraryChapter(); return; }
    setConversation(null); setChatNpc(null); setChapterError('');
    void cache.invalidateQueries({ queryKey: chapterKey });
    if (destination === place) setPanel('dormChapter');
    else { setDormDestination(destination); travel(destination, true); }
  }
  useEffect(() => { if (dormDestination === place && !traveling) { setDormDestination(null); setPanel('dormChapter'); } }, [dormDestination, place, traveling]);
  async function commitDorm(action: DormChapterAction, recordId?: string) {
    if (preview || chapterLock.current || !chapter.data || !libraryComplete) return null;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try {
      await cache.cancelQueries({ queryKey: chapterKey });
      const result = await writeDormChapter(action, dormChapter?.revision ?? 0, recordId);
      cache.setQueryData<ChapterState>(chapterKey, previous => ({ ...previous!, dorm: result }));
      if (result.completed_at) void cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
      if (action !== 'start' && result.revision !== (dormChapter?.revision ?? 0) + 1) { setPanel('dormChapter'); setChapterError('다른 창의 책갈피를 가져왔어요. 현재 장면에서 이어가 주세요.'); return null; }
      return result;
    } catch (e) { setChapterError((e as Error).message); return null; }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }
  const startDormAutomatically = useRef<() => void>(() => undefined);
  startDormAutomatically.current = () => { setConversation(null); setPanel('dormChapter'); void commitDorm('start'); };
  useEffect(() => {
    if (entry !== 'world' || preview || place !== 'plaza' || traveling || panel || !libraryComplete || dormChapter || dormAutoStarted.current) return;
    dormAutoStarted.current = true; startDormAutomatically.current();
  }, [entry, preview, place, traveling, panel, libraryComplete, dormChapter]);
  async function dormAction(action: 'arrive' | 'goal' | 'plan') {
    if (preview) return;
    if (action === 'arrive') { if (await commitDorm('arrive')) openDormChapter('dorm'); }
    else setPanel('planner');
  }
  async function dormRecordSaved(action: string, id: string) {
    if ((action === 'save_goal' && dormStep === 20) || (action === 'save_task' && dormStep === 26)) {
      await commitDorm(action === 'save_goal' ? 'goal' : 'plan', id);
      setPanel('dormChapter');
    }
  }

  const [skyDestination, setSkyDestination] = useState<Place | null>(null);
  const [skyNameGoal, setSkyNameGoal] = useState<string | null>(null);
  const skyAutoStarted = useRef(false);
  function openSkyChapter(destination: Place = skyStep < 17 ? 'plaza' : 'dorm') {
    if (!postComplete) { openPostChapter(); return; }
    if (!skyChapter && !postludeComplete) {
      setConversation(null); setChapterError('');
      if (place === 'plaza') setPanel('postlude');
      else { setSkyDestination('plaza'); travel('plaza', true); }
      return;
    }
    if (!skyChapter && !canStartSky) { setConversation(null); setPanel('planner'); return; }
    setConversation(null); setChatNpc(null); setChapterError('');
    void cache.invalidateQueries({queryKey: chapterKey});
    if (destination === place) setPanel('skyChapter');
    else { setSkyDestination(destination); travel(destination,true); }
  }
  useEffect(()=>{if(skyDestination===place&&!traveling){setSkyDestination(null);setPanel(!skyChapter&&!postludeComplete?'postlude':'skyChapter');}},[skyDestination,place,traveling,skyChapter,postludeComplete]);
  async function commitSky(action: SkyChapterAction, record: Partial<SkyPlacement> = {}) {
    if(preview||chapterLock.current||!chapter.data||!postComplete)return null;
    chapterLock.current=true;setChapterBusy(true);setChapterError('');
    try {
      await cache.cancelQueries({queryKey:chapterKey});
      const result=await writeSkyChapter(action,skyChapter?.revision??0,record);
      cache.setQueryData<ChapterState>(chapterKey,previous=>({...previous!,sky:result}));
      void cache.invalidateQueries({queryKey:chapterKey});
      void cache.invalidateQueries({queryKey:['academy-dormitory',userId]});
      if(action!=='start'&&result.revision!==(skyChapter?.revision??0)+1){setChapterError('다른 창의 책갈피를 가져왔어요. 현재 장면에서 이어가 주세요.');return null;}
      return result;
    } catch(e){setChapterError((e as Error).message);void cache.invalidateQueries({queryKey:chapterKey});return null;}
    finally{chapterLock.current=false;setChapterBusy(false);}
  }
  async function advancePostlude() {
    if (preview || chapterLock.current) return;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try {
      await cache.cancelQueries({ queryKey: chapterKey });
      const post = await writePostlude(postludeStep);
      cache.setQueryData<ChapterState>(chapterKey, previous => ({ ...previous!, post }));
      await cache.invalidateQueries({ queryKey: chapterKey });
      if (post.postlude_completed_at) setPanel(null);
    } catch (e) { setChapterError((e as Error).message); }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }
  const postludeAutoOpened = useRef(false);
  useEffect(() => {
    if (entry !== 'world' || preview || place !== 'plaza' || traveling || panel || !postComplete || skyChapter || postludeComplete || postludeAutoOpened.current) return;
    postludeAutoOpened.current = true; setConversation(null); setChapterError(''); setPanel('postlude');
  }, [entry, preview, place, traveling, panel, postComplete, skyChapter, postludeComplete]);
  const startSkyAutomatically=useRef<()=>void>(()=>undefined);
  startSkyAutomatically.current=()=>{setConversation(null);setPanel('skyChapter');void commitSky('start');};
  useEffect(()=>{if(entry!=='world'||preview||place!=='plaza'||traveling||panel||!postComplete||!canStartSky||skyChapter||skyAutoStarted.current)return;skyAutoStarted.current=true;startSkyAutomatically.current();},[entry,preview,place,traveling,panel,postComplete,canStartSky,skyChapter]);
  async function skyAction(action: 'arrive'|'light'|'place') {
    if(action==='arrive'){if(await commitSky('arrive'))openSkyChapter('dorm');}
    else if(action==='light'){if(await commitSky('light'))setPanel('skyChapter');else setPanel('planner');}
    else setPanel('sky');
  }
  // 창가의 하늘은 플래너·광장(테오)·핵심 기능 줄 어디서든 열린다 — 닫으면 «연 곳»으로 돌아간다(종전엔 늘 플래너로 가서, 광장에서 연 학생이 길을 잃었다).
  function openSky(goalId?: string, from: 'planner' | null = null){setSkyNameGoal(goalId??null);setSkyFrom(from);setConversation(null);setPanel('sky');}
  function openReadingChapter(destination: Place = 'library') {
    setConversation(null); setChatNpc(null); setChapterError('');
    if (destination === place) setPanel('readingChapter');
    else { setReadingDestination(destination); travel(destination, true); }
  }
  useEffect(() => { if (readingDestination === place && !traveling) { setReadingDestination(null); setPanel('readingChapter'); } }, [readingDestination, place, traveling]);
  async function commitReading(action: ReadingChapterAction, payload: { book_id?: string; card_id?: string } = {}) {
    if (preview || chapterLock.current || !chapter.data) return null;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try {
      const result = await writeReadingChapter(action, readingChapter?.revision ?? 0, payload);
      cache.setQueryData<ChapterState>(chapterKey, previous => ({ ...previous!, reading: result }));
      if (result.completed_at) void cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
      await cache.invalidateQueries({ queryKey: chapterKey });
      if (action !== 'start' && result.revision !== (readingChapter?.revision ?? 0) + 1) { setPanel('readingChapter'); setChapterError('다른 창의 책갈피를 가져왔어요. 현재 장면에서 이어가 주세요.'); return null; }
      return result;
    } catch (e) { setChapterError((e as Error).message); return null; }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }
  // 제5장을 마친 뒤 도서관에 처음 들어가면 세린이 말을 건다 — 광장 자동 시작과 같은 규칙(장면이 없을 때만, 한 번만).
  const startReadingAutomatically = useRef<() => void>(() => undefined);
  startReadingAutomatically.current = () => { setConversation(null); setPanel('readingChapter'); void commitReading('start'); };
  useEffect(() => { if (entry !== 'world' || preview || place !== 'library' || traveling || panel || !skyComplete || readingChapter || readingAutoStarted.current) return; readingAutoStarted.current = true; startReadingAutomatically.current(); }, [entry, preview, place, traveling, panel, skyComplete, readingChapter]);
  function readingAction(action: NonNullable<ReadingBeat['action']>) { setShelfMode(action === 'field' ? 'pickBook' : 'newCard'); setPanel('shelf'); }
  function openShelf(mode: ShelfMode) { setConversation(null); setShelfMode(mode); setPanel('shelf'); }
  async function pickReadingBook(book: BookRecommendation) {
    if (readingStep !== 8 || preview) return;
    if (await commitReading('field', { book_id: book.id })) setPanel('readingChapter');
  }
  async function saveShelfCard(draft: ReadingCardDraft, id?: string | null) {
    if (preview || chapterLock.current) return null;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try {
      const card = await saveReadingCard(draft, id);
      await cache.invalidateQueries({ queryKey: chapterKey });
      chapterLock.current = false; setChapterBusy(false);
      if (shelfMode === 'newCard' && readingStep === 12 && !id) { if (await commitReading('card', { card_id: card.id })) setPanel('readingChapter'); }
      return card;
    } catch (e) { setChapterError((e as Error).message); chapterLock.current = false; setChapterBusy(false); return null; }
  }
  async function deleteShelfCard(id: string) {
    if (preview || chapterLock.current) return;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try { await deleteReadingCard(id); await cache.invalidateQueries({ queryKey: chapterKey }); }
    catch (e) { setChapterError((e as Error).message); }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }

  const [postDestination, setPostDestination] = useState<Place | null>(null);
  const postAutoStarted = useRef(false);
  function openPostChapter(destination: Place = postStep < 13 ? 'plaza' : 'post') {
    if (!dormComplete) { openDormChapter(); return; }
    setConversation(null); setChatNpc(null); setChapterError('');
    void cache.invalidateQueries({ queryKey: chapterKey });
    if (destination === place) setPanel('postChapter');
    else { setPostDestination(destination); travel(destination, true); }
  }
  useEffect(() => { if (postDestination === place && !traveling) { setPostDestination(null); setPanel('postChapter'); } }, [postDestination, place, traveling]);
  async function commitPost(action: PostChapterAction, id?: number) {
    if (preview || chapterLock.current || !chapter.data || !dormComplete) return null;
    chapterLock.current = true; setChapterBusy(true); setChapterError('');
    try {
      await cache.cancelQueries({ queryKey: chapterKey });
      const result = await writePostChapter(action, postChapter?.revision ?? 0, id);
      cache.setQueryData<ChapterState>(chapterKey, previous => ({ ...previous!, post: result }));
      void cache.invalidateQueries({ queryKey: chapterKey });
      if (result.completed_at) void cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] });
      if (action !== 'start' && result.revision !== (postChapter?.revision ?? 0) + 1) { setPanel('postChapter'); setChapterError('다른 창의 책갈피를 가져왔어요. 현재 장면에서 이어가 주세요.'); return null; }
      return result;
    } catch (e) { setChapterError((e as Error).message); void cache.invalidateQueries({ queryKey: chapterKey }); return null; }
    finally { chapterLock.current = false; setChapterBusy(false); }
  }
  const startPostAutomatically = useRef<() => void>(() => undefined);
  startPostAutomatically.current = () => { setConversation(null); setPanel('postChapter'); void commitPost('start'); };
  useEffect(() => {
    if (entry !== 'world' || preview || place !== 'plaza' || traveling || panel || !dormComplete || postChapter || postAutoStarted.current) return;
    postAutoStarted.current = true; startPostAutomatically.current();
  }, [entry, preview, place, traveling, panel, dormComplete, postChapter]);
  async function postAction(action: 'arrive' | 'letters' | 'note') {
    if (preview) return;
    if (action === 'arrive') { if (await commitPost('arrive')) openPostChapter('post'); }
    else { setNewsId(action === 'note' ? postChapter?.news_id ?? null : null); setPanel('letters'); }
  }

  /**
   * 리아의 연속 탐구는 연구 수첩의 한 장이다(2026-10-04 사용자 요청 — 따로 뜨던 «질문이 별이 되는 여정» 창 대신).
   * 카시안의 «의뢰»가 아니라 리아가 도서관에서 찾은 자료로 이어 가는 연구다(같은 날 정정 — 연구시설의 «리아의 탐구 의뢰» 단추도 뺐다).
   * 여정 메뉴·SIDE STORY 가 수첩을 그 장으로 연다.
   */
  const [notebookFocus, setNotebookFocus] = useState<'journey' | null>(null);
  function openJourney() { setConversation(null); setChatNpc(null); setNotebookFocus('journey'); setPanel('history'); }
  const guideDispatch = useRef<(action: GuideAction) => void>(() => undefined);
  guideDispatch.current = action => {
    if (action === 'luon') talkToLuon();
    else if (action === 'self') setPanel('roommate');
    else if (action === 'professor') { setPanel(null); setChatNpc('professor'); }
    else if (action === 'telescope') openInstrument('telescope');
    else if (action === 'journey') openJourney();
    else { if (action === 'book') setReadingId(null); if (action === 'design' && !researchSeed) setResearchSeed(growth.data?.journey?.source_question || progress?.question || ''); setPanel(action); }
  };
  function goGuide(action: GuideAction) {
    setConversation(null); setChatNpc(null);
    if ((action === 'self' && !roommateUnlocked) || (action === 'journey' && !libraryComplete)) return;
    const destination: Place = action === 'self' ? 'dorm' : action === 'luon' ? 'plaza' : action === 'book' || action === 'journal' ? 'library' : action === 'letters' ? 'post' : 'observatory';
    if (place === destination) guideDispatch.current(action);
    else { setGuideDestination({ place: destination, action }); travel(destination); }
  }
  useEffect(() => { if (guideDestination?.place === place) { const action = guideDestination.action; setGuideDestination(null); guideDispatch.current(action); } }, [guideDestination, place]);
  function talkToLuon() {
    if (postComplete && !skyComplete && (skyChapter || !postludeComplete || canStartSky)) { openSkyChapter(); return; }
    if (dormComplete && !postComplete) { openPostChapter(); return; }
    if (libraryComplete && !dormComplete) { openDormChapter(); return; }
    const text = postComplete
      ? '리아, 다시 만나니 반가워요. 오늘은 어디에 마음이 가요? 새로 발견한 것도, 아직 풀리지 않은 생각도 좋아요. 저한테 들려줄래요?'
      : !firstComplete
      ? chapterStep < 3 ? '리아, 보여 주고 싶은 곳이 있어요. 준비됐으면 저랑 연구시설에 가 볼래요?'
        : chapterStep < 7 ? '망원경으로 보면 어떤 별이 보일지 궁금하네요. 교수님이 기다리고 계실 거예요. 같이 가요.'
          : chapterStep < 12 ? '리아는 어떤 별을 찾아보고 싶어요? 아직 막연해도 괜찮아요. 교수님과 이야기하다 보면 조금씩 떠오를 거예요.'
            : '리아가 그린 설계도, 저도 더 보고 싶어요. 교수님께도 마저 이야기해 줘요.'
      : libraryStep < 6 ? '리아, 저도 처음엔 별을 찾는 게 쉽지 않았어요. 그때 도움이 됐던 곳이 있는데… 같이 가 볼래요?'
        : libraryStep < 12 ? '도서관은 처음에 보면 좀 압도되죠? 저도 그랬어요. 엘리안에게 같이 인사하러 가요.'
          : libraryStep < 14 ? '어떤 책에 눈길이 가요? 제목이 마음에 드는 것부터 펼쳐 봐요. 저도 옆에서 같이 볼게요.'
            : libraryStep === 14 ? '방금 읽은 이야기에서 뭐가 제일 궁금했어요? 잊기 전에 적어 둬요. 왜 궁금했는지도요. 나중에 다시 읽으면 그때의 마음이 떠오르더라고요.'
              : !libraryComplete ? '리아의 질문은 어떤 건지 저도 듣고 싶네요. 엘리안에게 같이 들려주러 갈까요?'
                : '리아의 수첩에도 질문이 남았네요. 다음엔 어디가 궁금해요? 천천히 둘러봐요. 저는 여기서 기다릴게요.';
    setConversation({ npc: 'luon', text, choices: [
      ...(!skyComplete && (!postComplete || skyChapter || canStartSky) ? [{ label: postComplete ? `제5장 · ${skyChapterTitle} 이어가기` : dormComplete ? `제4장 · ${postChapterTitle} 이어가기` : libraryComplete ? `제3장 · ${dormChapterTitle} 이어가기` : firstComplete ? `제2장 · ${libraryChapterTitle} 이어가기` : '제1장 · 나의 첫 별 이어가기', action: () => postComplete ? openSkyChapter() : dormComplete ? openPostChapter() : libraryComplete ? openDormChapter() : firstComplete ? openLibraryChapter() : openChapter() }] : []),
      ...(waitingForSky && postludeComplete ? [{ label: `${skyWaitingText} · 플래너 펼치기`, action: () => { setConversation(null); setPanel('planner'); } }] : []),
      ...(firstComplete ? [{ label: '루온의 오늘의 격려 듣기', action: () => { setConversation(null); setPanel('encouragement'); } }] : []),
      { label: '다녀올게요', action: () => setConversation(null) },
    ] });
  }
  function talkToLibrarian() {
    if (!npcFeaturesUnlocked('librarian')) { openLibraryChapter(); return; }
    setConversation({ npc: 'librarian', text: '어서 오세요, 리아. 오늘은 어떤 이야기에 마음이 가나요? 관심 가는 책의 목차를 천천히 살펴보세요.', choices: [
      { label: '책장으로 가기', action: () => { setConversation(null); setReadingId(null); setPanel('book'); } },
      ...(libraryComplete ? [
        { label: '내 자습 참여 기록과 보상 확인하기', action: () => { setConversation(null); setPanel('study'); } },
        ...(!preview ? [{ label: '도서관에 새 이야기 제안하기', action: () => { setConversation(null); setProposing(true); } }] : []),
      ] : []),
      { label: '다시 둘러보기', action: () => setConversation(null) },
    ] });
  }
  function openInstrument(view: ResearchView | 'letters' | 'observations') {
    setConversation(null); setError(''); sound();
    if (view === 'telescope') { setCinematic('telescope'); return; }
    if (view !== 'letters') { setPanel(view); return; }
    setCinematic('pigeon');
    window.clearTimeout(travelTimer.current);
    travelTimer.current = window.setTimeout(() => { setCinematic(null); setPanel(view); }, reduced ? 0 : 850);
  }
  function talkAtFacility(npc: 'professor' | 'postmaster') {
    if (npc === 'professor' && !npcFeaturesUnlocked(npc)) { openChapter(); return; }
    if (npc === 'postmaster' && !npcFeaturesUnlocked(npc)) {
      openPostChapter();
      return;
    }
    const remembered = growth.data?.discoveries.find(d => d.memory_enabled);
    setConversation({ npc, text: npc === 'professor' && remembered
      ? `리아, 네 수첩에 “${remembered.statement.slice(0, 200)}”라고 남겼구나. 지금도 같은 생각인지, 새로 알게 된 것이 있는지 함께 이야기해 보자.` : npc === 'professor'
      ? '리아, 망원경 너머에는 네가 쌓아 온 지식의 별자리가 있단다. 어떤 별이 서로 연결되는지 보고, 네 다음 질문으로 새로운 별을 찾아보자. 네 활동에 대해 깊이 이야기해도 좋겠구나.'
      : '리아, 먼 세상에서 편지가 도착했어. 봉인을 열고 기사를 함께 읽어볼까? 궁금한 이야기는 나와 나누고, 떠오른 질문은 이곳 책상에서 기록할 수 있어.',
      choices: npc === 'professor' ? [
        ...(!preview && libraryComplete ? [{ label: '연구 수첩에서 연속 탐구 살펴보기', action: () => openJourney() }] : []),
        
        
        { label: '내 별자리 전체에 대한 조언 받기', action: () => openInstrument('advice') },
        { label: '내 활동을 바탕으로 교수 면담하기', action: () => openInstrument('interview') },
      ] : [
        { label: '도착한 편지의 봉인 열기', action: () => openInstrument('letters') },
        { label: '내 관측 일지 펼치기', action: () => openInstrument('observations') },
        ...(newsId ? [{ label: '방금 읽은 기사에 대해 이야기하기', action: () => { setConversation(null); setChatNpc('postmaster'); } }] : []),
      ],
    });
  }
  function meetDaily() {
    if (!dailyUnlocked) return;
    const destination: Place = ({ luon: 'plaza', librarian: 'library', professor: 'observatory', postmaster: 'post' } as const)[daily.data!.npc];
    if (destination === place) { setConversation(null); setPanel('daily'); }
    else { setDailyDestination(destination); travel(destination); }
  }
  useEffect(() => { if (dailyDestination === place) { setDailyDestination(null); setPanel('daily'); } }, [dailyDestination, place]);
  /**
   * 이야기가 기다리는 인물·물건 (2026-10-04 사용자 요청 — «진행해야 하는 이야기가 있으면 관련 NPC 가 눌러야 할 것처럼 보이게»).
   * 아래 handleInteraction 이 «누르면 장(章)을 연다»고 판정하는 조건을 그대로 옮겼다 — 표식과 실제 동작이 어긋나면
   * 표식을 믿고 눌렀는데 평범한 대화가 나온다. 조건을 고칠 땐 두 곳을 함께 고칠 것.
   */
  function storyWaiting(id: Interaction): boolean {
    if (preview) return false;
    switch (id) {
      case 'luon': return (postComplete && !skyComplete && (!!skyChapter || !postludeComplete || canStartSky)) || (dormComplete && !postComplete) || (libraryComplete && !dormComplete) || (!!chapter.data && chapterStep < 3);
      case 'professor': return !!chapter.data && chapterStep >= 3 && chapterStep < 16;
      case 'librarian': return firstComplete && !libraryComplete && !npcFeaturesUnlocked('librarian');
      case 'postmaster': return dormComplete && !postComplete;
      case 'mailbox': return dormComplete && !postComplete && postStep === 20;
      case 'writing': return dormComplete && !postComplete && postStep === 22;
      case 'serin': return place === 'library' ? skyComplete && !readingComplete : libraryComplete && !dormComplete;
      case 'lamplighter': return !!skyChapter && !skyComplete;
      default: return false;
    }
  }
  const handleInteraction = useRef<(id: Interaction) => void>(() => undefined);
  handleInteraction.current = id => {
    sound(); setError('');
    if (isGamePlace(id) && !canEnter(id)) return;
    if (id === 'window') { if(skyUnlocked)openSky();else openSkyChapter(); return; }
    if (id === 'lamplighter') { if(!skyChapter)return; setConversation({npc:'lamplighter',text:'오늘도 같은 길에 등불을 켰어요. 리아의 창가에는 어떤 빛이 남았나요?',choices:[{label:'창가의 하늘 보기',action:()=>skyUnlocked?openSky():openSkyChapter()},{label:'오늘 실천 표시하러 가기',action:()=>{setConversation(null);setPanel('planner');}}]});return; }
    if (id === 'luon' && postComplete && !skyComplete && (skyChapter || !postludeComplete || canStartSky)) { openSkyChapter(); return; }
    if (id === 'luon' && dormComplete && !postComplete) { openPostChapter(); return; }
    if (id === 'postmaster' && !postComplete) { openPostChapter(); return; }
    if ((id === 'mailbox' || id === 'writing') && !postComplete) {
      if (postStep === 20 || postStep === 22) void postAction(postStep === 20 ? 'letters' : 'note');
      else openPostChapter();
      return;
    }
    if (id === 'luon' && libraryComplete && !dormComplete) { openDormChapter(); return; }
    if (id === 'serin' && place === 'library') {
      if (!readingComplete) { openReadingChapter('library'); return; }
      setConversation({ npc: 'serin', text: '수요일의 창가예요. 오늘은 어떤 생각 하나를 설명해 볼까요? 막힌 곳이 있으면 거기부터 다시 읽어요.', choices: [{ label: '추천 서가 보기', action: () => openShelf('browse') }, { label: '설명 카드 적기', action: () => openShelf('newCard') }] });
      return;
    }
    if (id === 'serin' && !roommateUnlocked) { openDormChapter(); return; }
    if (id === 'study' && !libraryComplete) return;
    if (id === 'librarian' && !npcFeaturesUnlocked(id)) { openLibraryChapter(); return; }
    if (!preview && chapter.data && ((id === 'luon' && chapterStep < 3) || (id === 'professor' && chapterStep >= 3 && chapterStep < 16))) { openChapter(); return; }
    if (!preview && dailyUnlocked && id === daily.data?.npc) {
      setConversation({ npc: daily.data.npc, text: academyDailyInvitations[daily.data.npc], choices: [
        { label: daily.data.conversation?.question ? '오늘 나눈 이야기 이어가기' : '오늘의 이야기 듣기', action: () => { setConversation(null); setPanel('daily'); } },
        { label: '다른 이야기 하기', action: () => { if (id === 'luon') talkToLuon(); else if (id === 'librarian') talkToLibrarian(); else if (id === 'professor' || id === 'postmaster') talkAtFacility(id); } },
      ] });
    }
    else if (id === 'luon') talkToLuon();
    else if (id === 'librarian') talkToLibrarian();
    else if (id === 'shelf') { setReadingId(null); setPanel('book'); }
    else if (id === 'study') setPanel('study');
    else if (id === 'professor' || id === 'postmaster') talkAtFacility(id);
    else if (id === 'telescope') openInstrument('telescope');
    else if (id === 'desk') setPanel('table');
    else if (id === 'serin') setPanel('roommate');
    else if (id === 'planner' || id === 'wardrobe' || id === 'shop') setPanel(id);
    else if (id === 'mailbox') openInstrument('letters');
    else if (id === 'writing') { setNewsId(null); openInstrument('observations'); }
    else if (id === 'observatory' && !preview && chapter.data && chapterStep < 3) openChapter();
    else if (isGamePlace(id)) travel(id);
  };
  useEffect(() => {
    if (lockedPlace) return;
    let disposed = false;
    setReady(false); setEngineError(false);
    void import('./createWorld').then(({ createWorld }) => {
      if (disposed || !stage.current) return;
      world.current = createWorld(stage.current, initialPlace.current, initialReduced.current, id => handleInteraction.current(id), () => { if (!disposed) setReady(true); }, () => { if (!disposed) setEngineError(true); }, value => { if (!disposed) setLoadProgress(value); });
    }).catch(reason => { console.error('Academy scene initialization failed:', reason); if (!disposed) setEngineError(true); });
    return () => { disposed = true; world.current?.destroy(); world.current = null; };
  }, [engineAttempt, lockedPlace]);
  useLayoutEffect(() => { initialPlace.current = place; if (ready) world.current?.travel(place); }, [place, ready]);
  useEffect(() => {
    if (traveling !== place) return;
    // Keep the opaque cover through the destination's first painted frame.
    let reveal = 0;
    const frame = window.requestAnimationFrame(() => { reveal = window.requestAnimationFrame(() => setTraveling(null)); });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(reveal); };
  }, [place, traveling]);
  useEffect(() => { initialReduced.current = reduced; world.current?.motion(reduced); }, [reduced]);
  useEffect(() => { world.current?.pause(entry !== 'world' || !!conversation || !!chatNpc || !!panel || proposing || !!traveling || !!cinematic); }, [entry, conversation, chatNpc, panel, proposing, traveling, cinematic, ready]);
  useEffect(() => { if (place === 'observatory' && researchSeed) setPanel('design'); }, [place, researchSeed]);
  useEffect(() => {
    const assets = place === 'library' ? ['ria-reading-assisted'] : place === 'observatory' ? ['ria-telescope-assisted', 'research-desk', 'chapter-observatory-arrival'] : [];
    assets.forEach(asset => { const image = new Image(); image.src = `/images/academy-game/${asset}.png`; });
  }, [place]);
  useEffect(() => { world.current?.wardrobe(outfit); }, [outfit, ready]);
  // 이야기가 풀어 준 인물 — 제5장이 시작되면 광장에 테오가 선다(핫스팟과 같은 조건).
  const worldExtras: Partial<Record<Place, Npc[]>> = { plaza: skyChapter ? ['lamplighter'] : [], library: skyComplete ? ['serin'] : [] };
  useEffect(() => { world.current?.actors(worldExtras); }, [skyChapter, skyComplete, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  /** 이야기 표식을 올릴 자리 — 그려진 인물이면 머리 위(세계 대비 %), 물건(우편함·글쓰기 책상)이면 null(표식 바로 위에 단다). */
  const storyHead = (id: Interaction) => id in npcDetails ? npcHeadPoint(place, id as Npc, placeNpcs[place], worldExtras[place] ?? []) : null;
  function interact(id: Interaction) {
    if (engineError) handleInteraction.current(id);
    else world.current?.interact(id);
  }
  const close = () => { if (!chapterLock.current) { setConversation(null); setPanel(null); setError(''); } };
  const dockOpen = (open: () => void) => () => { if (inventory.current) inventory.current.open = false; setConversation(null); open(); };
  // 순서 = 기능을 배우는 장의 순서. 잠긴 칸은 «제N장을 마치면 열려요»를 들려준다(GameDock).
  const dockItems: DockItem[] = [
    { id: 'map', icon: '◎', label: '지도', unlocked: true, unlockChapter: 0, onOpen: dockOpen(() => setPanel('map')) },
    { id: 'telescope', icon: '✧', label: '망원경', unlocked: firstComplete, unlockChapter: 1, onOpen: dockOpen(() => openInstrument('telescope')) },
    { id: 'desk', icon: '✎', label: '연구대', unlocked: firstComplete, unlockChapter: 1, onOpen: dockOpen(() => setPanel('table')) },
    { id: 'books', icon: '▤', label: '책장', unlocked: libraryComplete, unlockChapter: 2, onOpen: dockOpen(() => { setReadingId(null); setPanel('book'); }) },
    { id: 'planner', icon: '☽', label: '플래너', unlocked: dormComplete, unlockChapter: 3, onOpen: dockOpen(() => setPanel('planner')) },
    { id: 'letters', icon: '✉', label: '편지', unlocked: postComplete, unlockChapter: 4, onOpen: dockOpen(() => openInstrument('letters')) },
    { id: 'sky', icon: '✦', label: '창가의 하늘', unlocked: skyComplete, unlockChapter: 5, onOpen: dockOpen(() => openSky()) },
    { id: 'shelf', icon: '❦', label: '세린의 서가', unlocked: readingComplete, unlockChapter: 6, onOpen: dockOpen(() => openShelf('browse')) },
    { id: 'friends', icon: '❀', label: '친구', unlocked: dormComplete, unlockChapter: 3, badge: friends.data?.incoming?.length ?? 0, onOpen: dockOpen(() => setPanel('friends')) },
  ];
  if (lockedPlace) return <main className={styles.game}><p role="status">{chapter.isError ? '이야기의 책갈피를 확인하지 못했어요.' : '이야기의 순서에 맞는 장소로 안내하고 있어요…'}</p>{chapter.isError && <button onClick={() => void chapter.refetch()}>다시 확인하기</button>}</main>;
  // 장소 배경 — 화면이 3:2 보다 넓으면 좌우로 늘린 판을 쓴다(game.module.css 의 data-wide · wideBackdrops.ts).
  const stageBackdrop = place === 'dorm' ? outfit.room : place;
  const stageWide = wideBackdrop(stageBackdrop);
  return <WardrobeContext.Provider value={outfit}><GameSurfaceContext.Provider value={surface}><SceneReturnContext.Provider value={`← ${withEuro(placeNames[place])} 돌아가기`}><main className={styles.game} data-reduced={reduced}>


    <div className={styles.sceneLayout}>
      <section className={styles.stage} data-conversation={entry !== 'world' || !!conversation || !!chatNpc || proposing || panel === 'postlude' || panel === 'friendRoom' || panel === 'sky' || panel === 'skyChapter' || panel === 'readingChapter' || panel === 'shelf' || panel === 'illustrations' || panel === 'chapter' || panel === 'libraryChapter' || panel === 'dormChapter' || panel === 'postChapter' || panel === 'encouragement' || panel === 'roommate' || panel === 'daily' || panel === 'advice' || panel === 'interview'} data-panel={!!panel || !!conversation || !!chatNpc} aria-label={`${placeNames[place]} 탐험`} data-wide={stageWide ? true : undefined} style={{ backgroundImage: `url("${gameAsset(stageBackdrop)}")`, ...(stageWide ? { ['--wide-backdrop' as string]: `url("${stageWide}")` } : {}) }}>
    <header className={styles.hud}>
      <GameExitButton className={styles.exit}><ChevronLeft size={16} /> 나가기</GameExitButton>
      <div className={styles.location}><span>ASTRAEA · {readingChapter ? 'CHAPTER VI' : skyChapter ? 'CHAPTER V' : postChapter ? 'CHAPTER IV' : dormChapter ? 'CHAPTER III' : library ? 'CHAPTER II' : 'CHAPTER I'}{(readingChapter ? readingComplete : skyComplete) ? ' · COMPLETE' : ''}</span><h1>{place === 'plaza' ? '별빛 아카데미' : placeNames[place]}</h1></div>
      <div className={styles.hudActions}>{/* «발견의 인장» 숫자는 2026-10-04 사용자 결정으로 뺐다 — 0~2 만 오가는 숫자가 코인처럼 읽혔고 화면에 설명이 없었다. */}<button aria-label={soundEnabled ? '효과음 끄기' : '효과음 켜기'} aria-pressed={soundEnabled} onClick={() => setSoundEnabled(v => !v)}>{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button aria-label="동작 줄이기" aria-pressed={reduced} onClick={() => setReduced(v => !v)}><Sparkles size={18} /></button>{screenControl?.available && <button aria-label={screenControl.label} title={screenControl.label} aria-pressed={screenControl.state.mode !== 'none'} aria-busy={screenControl.busy || undefined} data-orientation-toggle onClick={() => void screenControl.toggle()}>{screenControl.state.mode !== 'none' ? <RotateCcw size={18} /> : screenControl.portrait ? <RectangleHorizontal size={18} /> : <RectangleVertical size={18} />}</button>}</div>
    </header>
      {/* 왼쪽 아래 핵심 기능 줄 (2026-10-03) — 장(章)을 마칠 때마다 하나씩 열린다. 종전의 «플래너» 단추(2026-09-14)와 여정 메뉴 속 기능 바로가기를 대신한다. */}
      {entry === 'world' && <GameDock hidden={!!panel || !!conversation || !!chatNpc || proposing} items={dockItems} />}
      <details ref={inventory} className={styles.questCard} onClick={e => { if ((e.target as HTMLElement).closest('button') && inventory.current) inventory.current.open = false; }}><summary>✧ 여정과 소지품</summary><div className={styles.inventoryBody}><span className={styles.kicker}>{waitingForSky ? "CHAPTER IV · EPILOGUE" : skyComplete ? "CHAPTER VI" : postComplete ? "CHAPTER V" : dormComplete ? "CHAPTER IV" : libraryComplete ? "CHAPTER III" : firstComplete ? "CHAPTER II" : "CHAPTER I"}</span><h2>{waitingForSky ? "나의 발걸음으로" : skyComplete ? readingChapterTitle : postComplete ? skyChapterTitle : dormComplete ? postChapterTitle : libraryComplete ? dormChapterTitle : firstComplete ? libraryChapterTitle : "나의 첫 별"}</h2><p className={styles.questSubtitle}>{waitingForSky ? skyWaitingText : skyComplete ? "도서관의 세린과 설명하며 읽는 법을 배우세요." : postComplete ? "창가에 나의 실천을 별로 남기세요." : dormComplete ? "노엘과 최신 편지를 읽고 나의 관측 일지를 남기세요." : libraryComplete ? "세린과 나의 첫 목표와 계획을 남기세요." : firstComplete ? "다른 사람의 기록에서 나의 질문을 발견하세요." : "카시안과 나의 하늘을 살펴보고 첫 탐구를 설계하세요."}</p><div className={styles.questProgress}>{(skyComplete ? [8, 12, 13, 17] : postComplete ? [17, 22, 23, 29] : dormComplete ? [13, 21, 23, 30] : libraryComplete ? [7, 21, 27, 36] : firstComplete ? [6, 12, 15, 18] : [3, 7, 12, 16]).map(i => <span key={i} data-done={(skyComplete ? readingStep : postComplete ? skyStep : dormComplete ? postStep : libraryComplete ? dormStep : firstComplete ? libraryStep : chapterStep) >= i} />)}</div><p className={styles.objective}>{waitingForSky ? skyWaitingText : skyComplete ? readingChapterObjective(readingStep) : postComplete ? skyChapterObjective(skyStep) : dormComplete ? postChapterObjective(postStep) : libraryComplete ? dormChapterObjective(dormStep) : firstComplete ? libraryChapterObjective(libraryStep) : chapterObjective(chapterStep)}</p>
        {!preview && saved.isPending && <p role="status">여행 기록을 불러오는 중…</p>}
        {!preview && saved.isError && <p className={styles.error} role="alert">여행 기록을 불러오지 못했어요. <button onClick={() => void saved.refetch()}>기록 다시 불러오기</button></p>}
        {/* 지금 이어갈 장 하나만 금빛 주행동이다. 마친 장은 아래 «지난 이야기»의 조용한 줄로 — 종전엔 장 버튼 여섯이 모두 같은 금빛이라 무엇을 눌러야 하는지 보이지 않았다(2026-10-03). */}
        {(() => {
          const rows = [
            { n: 1, title: '나의 첫 별', done: chapterStep === 16, open: true, go: () => openChapter() },
            { n: 2, title: libraryChapterTitle, done: libraryComplete, open: firstComplete, go: () => openLibraryChapter() },
            { n: 3, title: dormChapterTitle, done: dormComplete, open: libraryComplete, go: () => openDormChapter() },
            { n: 4, title: postChapterTitle, done: postComplete, open: dormComplete, go: () => openPostChapter() },
            { n: 5, title: skyChapterTitle, done: skyComplete, open: postComplete, go: () => openSkyChapter() },
            { n: 6, title: readingChapterTitle, done: readingComplete, open: skyComplete, go: () => openReadingChapter() },
          ].filter(r => r.open);
          const current = rows.find(r => !r.done);
          const currentLabel = current?.n === 5 && waitingForSky ? (!postludeComplete ? '루온과의 약속 이어가기' : canStartSky ? '제5장 · 루온 찾아가기' : '다섯 가지 계획 · 플래너 펼치기') : current ? `제${current.n}장 이어가기` : null;
          const past = rows.filter(r => r.done);
          return <>
            {current && currentLabel && <button className={`${styles.goldButton} ${styles.continueButton}`} onClick={current.go}>▶ {currentLabel}</button>}
            {!current && <p className={styles.allDone}>✦ 지금까지의 이야기를 모두 마쳤어요. 다음 장이 열리면 여기에 나타나요.</p>}
            {past.length > 0 && <div className={styles.menuGroup}><span className={styles.menuGroupTitle}>지난 이야기 · 다시 보기</span>{past.map(r => <button key={r.n} className={styles.chapterRow} aria-label={`제${r.n}장 · ${r.title} 다시 보기`} onClick={r.go}><span>제{r.n}장</span>{r.title}<em aria-hidden="true">✓</em></button>)}</div>}
          </>;
        })()}
        {!preview && <div className={styles.growthLinks}>
          {libraryComplete && <button className={styles.dailyInvite} onClick={openJourney}><small>SIDE STORY</small><strong>질문이 별이 되는 여정</strong><span>{growth.data?.journey ? journeyObjectives[growth.data.journey.stage] : '도서관에서 찾은 질문으로 연구를 이어 가요'}</span></button>}
          {roommateUnlocked && <button className={styles.dailyInvite} onClick={() => goGuide('self')}><small>SIDE STORY</small><strong>세린과 나를 알아가기</strong><span>세린과 이야기하며 나의 마음과 성향을 살펴보세요 →</span></button>}
        </div>}
        {!preview && dailyUnlocked && daily.data && <button className={styles.dailyInvite} onClick={meetDaily}><small>TODAY'S ENCOUNTER</small><strong>✦ {npcDetails[daily.data.npc].name}의 오늘의 만남</strong><span>{daily.data.conversation?.question ? '나눈 이야기 이어가기 →' : '리아에게 하고 싶은 이야기가 있대요 →'}</span></button>}
        {!preview && firstComplete && daily.isError && <button className={styles.textButton} onClick={() => void daily.refetch()}>오늘의 만남 다시 불러오기</button>}
        {studentId?.startsWith('experience:') && <p className={styles.hint}>교사·관리자 체험 · 기본 자료: 00-00001<br />체험 기록은 내 계정에만 저장됩니다.</p>}<AdminPreviewControl />
        <div className={styles.menuGroup}><span className={styles.menuGroupTitle}>모음 · 연습</span>
          <button className={styles.chapterRow} onClick={() => setPanel('illustrations')}>수집한 삽화 보기</button>
          <button className={styles.chapterRow} onClick={() => setFilm('world')}>▶ 프롤로그 영상 보기</button>
          <button className={styles.chapterRow} onClick={replayPrologue}>프롤로그 다시 감상하기</button>
          {firstComplete && !preview && <button className={styles.chapterRow} onClick={replayChapter}>제1장 다시 해보기 · 망원경과 설계지 안내</button>}
        </div>
        {isAdmin && !preview && <AdminStoryReset onDone={from => {
          // 지운 장부터 처음처럼 — 아카데미 조회를 전부 새로 읽고, 프롤로그부터면 타이틀로 돌아가 이야기를 다시 연다.
          void cache.invalidateQueries({ predicate: q => String(q.queryKey[0] ?? '').startsWith('academy-') });
          setReplay1(null); setPanel(null); setConversation(null);
          if (inventory.current) inventory.current.open = false;
          if (from === 'prologue') setEntry('title');
        }} />}
        <button className={styles.textButton} onClick={() => setEntry('title')}>타이틀로 돌아가기</button>
        <p className={styles.hint}>인물이나 장소의 표식을 누르면 걸어가요. 빈 바닥을 눌러 자유롭게 이동할 수도 있어요.<br />왼쪽 아래 메달을 누르면 지도·망원경·플래너 같은 기능이 궤도에 펼쳐져요.</p>
      </div></details>
            {preview && <p className={styles.preview}>학생 시점 미리보기 · 챕터 진행과 기록 변경은 학생 본인만 할 수 있습니다.</p>}
        <div className={styles.worldPlane}>
        <div ref={stage} className={styles.canvas} aria-hidden="true" />
        {engineError && <div className={styles.loading} role="alert"><p>장면을 불러오지 못했어요. 아래 장소 버튼으로 계속 탐험할 수 있어요.</p><button onClick={() => setEngineAttempt(v => v + 1)}>장면 다시 불러오기</button></div>}
        {!traveling && (ready || engineError) && <nav aria-label="장소 상호작용" className={styles.hotspots}>{hotspots[place].filter(spot => (spot.id !== 'study' || libraryComplete) && (spot.id !== 'window' || skyUnlocked) && (spot.id !== 'lamplighter' || !!skyChapter) && (spot.id !== 'serin' || place !== 'library' || skyComplete)).map(spot => {
          // 그려진 인물은 동그라미 표식 없이 발밑 이름표만 — 인물 그림을 눌러도 같은 상호작용이다(2026-10-04 사용자 요청, createWorld 의 그림 클릭).
          const foot = spot.id in npcDetails ? npcFootPoint(place, spot.id as Npc, placeNpcs[place], worldExtras[place] ?? []) : null;
          if (foot) return <button key={spot.id} className={styles.npcName} style={{ left: `${foot.x}%`, top: `${foot.y}%` }} aria-label={storyWaiting(spot.id) ? `${spot.label} · 이야기가 기다려요` : spot.label} onClick={() => interact(spot.id)} data-story={storyWaiting(spot.id) || undefined} data-daily={(!preview && dailyUnlocked && spot.id === daily.data?.npc) || undefined}>
            <span className={styles.npcNameTag} aria-hidden="true">{!preview && dailyUnlocked && spot.id === daily.data?.npc && <i>✦</i>}{npcDetails[spot.id as Npc].name}</span></button>;
          return <button key={spot.id} style={{ left: `${spot.x}%`, top: `${spot.y}%` }} aria-label={storyWaiting(spot.id) ? `${spot.label} · 이야기가 기다려요` : spot.label} disabled={isGamePlace(spot.id) && !canEnter(spot.id)} title={isGamePlace(spot.id) && !canEnter(spot.id) ? unlockHint(spot.id) : undefined} onClick={() => interact(spot.id)} data-story={storyWaiting(spot.id) || undefined}>{storyWaiting(spot.id) && !storyHead(spot.id) && <span className={styles.storyBeacon} aria-hidden="true"><i /><b>!</b></span>}<span className={styles.marker}>{!preview && dailyUnlocked && spot.id === daily.data?.npc ? '✦' : spot.id === 'luon' && step || spot.id === 'librarian' && step !== 'ready' ? '…' : spot.icon}</span><span className={styles.hotspotLabel}>{spot.label}{isGamePlace(spot.id) && !canEnter(spot.id) && <small className={styles.lockHint}>{unlockHint(spot.id)}</small>}</span></button>;
        })}{hotspots[place].filter(spot => storyWaiting(spot.id) && (spot.id !== 'serin' || place !== 'library' || skyComplete) && (spot.id !== 'lamplighter' || !!skyChapter)).map(spot => { const head = storyHead(spot.id); return head && <span key={`story-${spot.id}`} className={`${styles.storyBeacon} ${styles.storyHead}`} data-story-head={spot.id} style={{ left: `${head.x}%`, top: `${head.y}%` }} aria-hidden="true"><i /><b>!</b></span>; })}</nav>}
        <div className={styles.sceneCaption}><span>✦ {placeNames[place]}</span><p>{{ plaza: '리아의 여정 · 나의 질문이 별이 되는 곳', library: '책 한 권을 펼치면, 누군가의 세계가 열린다.', observatory: '오늘의 호기심으로 내일의 별을 발견한다.', post: '먼 세상의 이야기가 나의 새로운 질문이 된다.', dorm: '오늘의 작은 실천을 적고, 내일의 나를 준비한다.' }[place]}</p></div>
        </div>
        <div ref={setSurface} className={styles.surfacePortal} />
        {cinematic === 'pigeon' && <div className={styles.pigeonTransition} role="status"><span>🕊</span><p>노엘의 전서구가 편지를 내려놓고 있어요…</p></div>}
        {traveling && <div className={styles.travel} role="status"><span>✧</span><p>{withEuro(placeNames[traveling])} 이동 중</p></div>}
      </section>

    </div>
    {!preview && libraryComplete && ['journey', 'self'].includes(panel ?? '') && (growth.data && studentId ? <GrowthPanel key={panel} mode={panel as GrowthView} state={growth.data} progress={journeyProgress} userId={userId} studentId={studentId} reduced={reduced} onClose={close} onGo={goGuide} onTalk={() => goGuide('professor')}  /> : <GameModal title="리아의 여정" onClose={close} reduced={reduced}><p role="status">{growth.isError ? '여정 기록을 가져오지 못했어요.' : '리아의 여정 기록을 가져오고 있어요…'}</p>{growth.isError && <button onClick={() => void growth.refetch()}>여정 다시 불러오기</button>}</GameModal>)}
    {panel === 'illustrations' && <IllustrationGallery illustrations={collectIllustrations(chapter.data, preview ? null : bookmark.data)} loading={chapter.isPending || (!preview && bookmark.isPending)} error={chapter.isError || (!preview && bookmark.isError)} preview={preview} reduced={reduced} onClose={close} onRetry={() => { void chapter.refetch(); if (!preview) void bookmark.refetch(); }} />}
    {panel === 'chapter' && (chapter.data ? <ChapterScene state={replay1 ? { ...chapter.data, chapter: replay1 } : chapter.data} readOnly={preview} reduced={reduced} busy={chapterBusy} error={chapterError} onClose={close} onNext={() => void commitChapter('next')} onAction={action => void chapterAction(action)} onDesign={id => void chapterDesignSaved(id)} onTalk={() => { setPanel(null); setChatNpc('professor'); }} /> : <GameModal title="제1장 · 나의 첫 별" onClose={close} reduced={reduced}><p>{chapter.isError ? '이야기의 책갈피를 가져오지 못했어요.' : '첫 장을 펼치고 있어요…'}</p><button onClick={() => void chapter.refetch()}>다시 펼치기</button></GameModal>)}
    {entry === 'title' && <GameTitle startLabel={preview ? '학생 시점으로 둘러보기' : firstStory ? bookmark.data ? '프롤로그 이어보기' : '이야기 시작' : '이어서 하기'} loading={entryLoading} error={entryError} canReplay={preview || !firstStory} onStart={() => { setPrologueReplay(false); setEntry(firstStory ? 'prologue' : 'world'); if (!firstStory && !preview) { if (chapterStep < 16) openChapter(); else if (library && !libraryComplete) openLibraryChapter(); else if (dormChapter && !dormComplete) openDormChapter(); else if (postChapter && dormComplete && !postComplete) openPostChapter(); else if(skyChapter && postComplete && !skyComplete)openSkyChapter(); else if(readingChapter && skyComplete && !readingComplete)openReadingChapter(); } }} onReplay={replayPrologue} onFilm={() => setFilm('title')} onRetry={() => { void saved.refetch(); void bookmark.refetch(); void chapter.refetch(); }} />}
    {entry === 'prologue' && <Prologue reduced={reduced} replay={prologueReplay} initialIndex={prologueReplay ? 0 : bookmark.data?.scene_index} onSave={async (index, finish) => { if (preview) return; const result = await savePrologue(index, prologueReplay ? undefined : finish); cache.setQueryData(prologueKey, result); }} onDone={finishPrologue} onFilm={() => setFilm('prologue')} onExit={() => setEntry(prologueReplay ? replayReturn.current : 'title')} />}
    {film && <PrologueTheater reduced={reduced} returnLabel={{ title: '타이틀로 돌아가기', prologue: '이야기로 돌아가기', world: '아카데미로 돌아가기' }[film]} onClose={() => setFilm(null)} />}
    {cinematic === 'telescope' && <ActionScene action="telescope" reduced={reduced} onComplete={() => { setCinematic(null); setPanel('telescope'); }} onCancel={() => setCinematic(null)} />}
    {libraryComplete && (panel === 'planner' || panel === 'wardrobe' || panel === 'shop') && <GameDormitory skyGuide={skyStep===21?{onReturn:()=>{void skyAction('light');}}:undefined} chapterGuide={!dormComplete && (dormStep === 20 || dormStep === 26) ? { phase: dormStep === 20 ? 'goal' : 'plan', goalId: dormChapter?.goal_id ?? null, goalTitle: dormChapter?.goal_title ?? null } : undefined} onChapterReturn={() => openDormChapter()} onRecordSaved={dormRecordSaved} view={panel} userId={userId} studentId={studentId} readOnly={preview} onClose={() => setPanel(null)} onView={setPanel} />}
    {panel === 'table' && <ResearchTable chapterGuide={chapterStep === 10 || chapterStep === 11} busy={chapterBusy} error={chapterError} onSelect={async view => { if (view === 'design' && chapterStep === 10 && !preview && !await commitChapter('desk')) return; setPanel(view); }} onClose={close} />}
    {conversation && <Dialogue conversation={conversation} onClose={close} reduced={reduced} busy={chapterBusy} error={error} onFreeTalk={preview || !npcFeaturesUnlocked(conversation.npc) ? undefined : () => { if (conversation.npc === 'serin') setPanel('roommate'); else if(conversation.npc!=='lamplighter')setChatNpc(conversation.npc); setConversation(null); }} />}
    {panel === 'encouragement' && <GameEncouragement userId={userId} studentId={studentId} readOnly={preview} reduced={reduced} onClose={close} />}
    {panel === 'study' && <GameStudyLedger userId={userId} studentId={studentId} readOnly={preview} onClose={close} />}
    {panel === 'friends' && <GameFriends userId={userId} reduced={reduced} onClose={close} onVisit={(friend, preview) => { setFriendVisit({ id: friend.id, name: friend.name, preview }); setPanel('friendRoom'); }} />}
    {panel === 'friendRoom' && friendVisit && <FriendRoom key={friendVisit.id} friendId={friendVisit.id} friendName={friendVisit.name} preview={friendVisit.preview} reduced={reduced} onClose={() => setPanel('friends')} />}
    {roommateUnlocked && panel === 'roommate' && <GameRoommate userId={userId} studentId={studentId} readOnly={preview} reduced={reduced} onClose={() => setPanel(null)} />}
    {chatNpc && npcFeaturesUnlocked(chatNpc) && <NpcChat npc={chatNpc} newsId={chatNpc === 'postmaster' ? newsId : null} onClose={() => setChatNpc(null)} reduced={reduced} onRecord={chatNpc === 'postmaster' && newsId ? text => { setConversationNote(text); setPanel('observations'); setChatNpc(null); } : undefined} onReference={source => { setChatNpc(null); if (source.kind === 'news') { setNewsId(Number(source.id)); setPanel('letters'); } else { setReadingId(source.id); setPanel('book'); } }} />}
    {panel === 'daily' && dailyUnlocked && !preview && daily.data && <DailyEncounter userId={userId} initial={daily.data} onClose={close} reduced={reduced} />}
    {panel === 'book' && <GameBook initialActivityId={readingId} onClose={close} busy={chapterBusy} error={chapterError} reduced={reduced} sound={sound} onRead={libraryStep === 13 && !preview ? async id => { if (await commitLibrary('read', { activityId: id })) setPanel('libraryChapter'); } : undefined}
      onResearch={firstComplete && !preview && libraryStep !== 13 ? (text, context) => { setResearchSeed(text); setResearchContext(context); setGuideDestination({ place: 'observatory', action: 'design' }); travel('observatory'); } : undefined} />}
    <LibraryChapterNote open={panel === 'journal' && libraryStep === 14} record={library} busy={chapterBusy} error={chapterError} readOnly={preview} reduced={reduced} onClose={close} onSave={async (question, reason) => { if (await commitLibrary('note', { question, reason })) setPanel('libraryChapter'); }} />
    {panel === 'postlude' && <PostludeScene step={postludeStep} busy={chapterBusy} error={chapterError} readOnly={preview} reduced={reduced} onNext={()=>void advancePostlude()} onClose={()=>setPanel(null)} />}
    {panel === 'sky' && <GameSky userId={userId} studentId={studentId} readOnly={preview} reduced={reduced} nameGoalId={skyNameGoal} backLabel={skyFrom === 'planner' ? '← 플래너로 돌아가기' : `← ${withEuro(placeNames[place])} 돌아가기`} onClose={()=>setPanel(skyFrom)} onChapterReturn={!skyComplete?()=>openSkyChapter():undefined} onPlaced={skyStep===22?async placement=>{if(!await commitSky('place',placement))throw Error('책갈피를 저장하지 못했어요. 새긴 별로 이어갈 수 있어요.');setPanel('skyChapter');}:undefined}/>}
    {panel === 'skyChapter' && chapter.data && <SkyChapterScene state={chapter.data} busy={chapterBusy} error={chapterError} readOnly={preview} reduced={reduced} onClose={()=>skyComplete?openSky():setPanel(null)} onNext={()=>void commitSky(skyChapter?'next':'start')} onAction={action=>void skyAction(action)}/>}
    {panel === 'readingChapter' && <ReadingChapterScene record={readingChapter} readOnly={preview} reduced={reduced} busy={chapterBusy} error={chapterError} onClose={() => readingComplete ? openShelf('browse') : setPanel(null)} onNext={() => void commitReading(readingChapter ? 'next' : 'start')} onAction={readingAction} />}
    <ReadingShelf open={panel === 'shelf'} mode={shelfMode} chapter={!preview && !readingComplete && ((shelfMode === 'pickBook' && readingStep === 8) || (shelfMode === 'newCard' && readingStep === 12))} books={books.data} booksError={books.isError} onRetryBooks={() => void books.refetch()} cards={chapter.data?.readingCards ?? []} busy={chapterBusy} error={chapterError} readOnly={preview} reduced={reduced} chapterBookTitle={readingChapter?.reading_book_title ?? null} onClose={() => setPanel(readingChapter && !readingComplete ? 'readingChapter' : null)} onPickBook={pickReadingBook} onSaveCard={saveShelfCard} onDeleteCard={deleteShelfCard} />
    {panel === 'postChapter' && chapter.data && <PostChapterScene state={chapter.data} readOnly={preview} reduced={reduced} busy={chapterBusy} error={chapterError} onClose={close} onNext={() => void commitPost(postChapter ? 'next' : 'start')} onAction={action => void postAction(action)} onRecord={() => void commitPost('note')} />}
    {panel === 'dormChapter' && chapter.data && <DormChapterScene state={chapter.data} readOnly={preview} reduced={reduced} busy={chapterBusy} error={chapterError} onClose={() => { if (!chapterLock.current) setPanel(null); }} onNext={() => void commitDorm(dormChapter ? 'next' : 'start')} onAction={action => void dormAction(action)} onRecord={(action, id) => void commitDorm(action, id)} />}
    {panel === 'libraryChapter' && <LibraryChapterScene record={library} readOnly={preview} reduced={reduced} busy={chapterBusy} error={chapterError} onClose={close} onNext={() => void commitLibrary(library ? 'next' : 'start')} onAction={action => void libraryAction(action)} onBooks={() => { setReadingId(null); setPanel('book'); }} onPropose={() => { setPanel(null); setProposing(true); }} />}
    {panel === 'map' && <GameModal title="아카데미 지도" onClose={close} className={styles.mapPanel} reduced={reduced}><span className={styles.kicker}>THE ACADEMY GROUNDS</span><h2>다음 이야기는 어디에 있을까요?</h2><div className={styles.mapPlaces}>{[{ id: 'plaza', title: '중앙 광장', icon: '✧', sub: '루온 · 현재 챕터의 이야기' }, { id: 'library', title: '왕립 도서관', icon: '▤', sub: '엘리안 · 책과 이야기' }, { id: 'observatory', title: '별의 연구시설', icon: '☾', sub: '나의 별자리 · 탐구 · 교수 면담' }, { id: 'post', title: '전서구 우편국', icon: '✉', sub: '세상에서 도착한 소식' }, { id: 'dorm', title: '별빛 기숙사', icon: '☽', sub: '일정·하루 계획 · 옷장·방 꾸미기' }].map(location => <button key={location.id} disabled={!canEnter(location.id as Place)} aria-current={place === location.id ? 'location' : undefined} onClick={() => travel(location.id as Place)}><span>{location.icon}</span><strong>{location.title}</strong><small>{canEnter(location.id as Place) ? location.sub : unlockHint(location.id as Place)}</small>{place === location.id && <em>현재 위치</em>}</button>)}</div></GameModal>}
    <GameObservatory onChapterObserved={chapterStep === 6 ? async hasStars => { const result = await commitChapter('observe', undefined, hasStars); if (!result) throw Error('챕터의 관측 기록을 보관하지 못했어요. 다시 시도해 주세요.'); setPanel('chapter'); } : undefined} onChapterDesignSaved={chapterStep === 11 ? chapterDesignSaved : undefined} studentId={studentId} readOnly={preview} open={!!panel && ['telescope', 'design', 'advice', 'interview', 'history'].includes(panel)} view={(['telescope', 'design', 'advice', 'interview', 'history'].includes(panel ?? '') ? panel : 'telescope') as ResearchView} onViewChange={setPanel} onClose={() => { if (panel === 'design' || panel === 'history') setPanel('table'); else close(); }} reduced={reduced} seed={researchSeed} seedContext={researchContext} onSeedConsumed={() => { setResearchSeed(''); setResearchContext(null); }} journeyEnabled={libraryComplete && !preview} notebookFocus={notebookFocus} onNotebookFocusConsumed={() => setNotebookFocus(null)} />
    <GamePost chapterGuide={!postComplete && (postStep === 20 || postStep === 22) ? { phase: postStep === 20 ? 'read' : 'note', letter: chapter.data?.postLetter ?? null, busy: chapterBusy, error: chapterError, onRead: async id => { if (await commitPost('read', id)) setPanel('postChapter'); }, onNote: async () => { await commitPost('note'); setPanel('postChapter'); }, onReturn: () => openPostChapter(), onRefresh: () => { void chapter.refetch(); } } : undefined} onSaved={() => { void cache.invalidateQueries({ queryKey: ['academy-growth', userId] }); }} conversationNote={conversationNote} onNoteConsumed={() => setConversationNote('')} userId={userId} readOnly={preview} open={panel === 'letters' || panel === 'observations'} notebook={panel === 'observations'} newsId={newsId} onNewsChange={setNewsId} onClose={close} reduced={reduced} onTalk={npcFeaturesUnlocked('postmaster') ? id => { setNewsId(id); setPanel(null); setChatNpc('postmaster'); } : undefined} onResearch={(text, context) => { setResearchSeed(text); setResearchContext(context); setGuideDestination({ place: 'observatory', action: 'design' }); travel('observatory'); }} />
    {proposing && libraryComplete && !preview && <GameProposal studentCode={access.myStudentCode} reduced={reduced} onClose={() => setProposing(false)} onSubmit={async input => { if (preview) return; await proposal.mutateAsync(input); setProposing(false); }} />}
  {((!ready && !engineError) || !wideReady) && <AcademyLoadingView progress={loadProgress * 90 + (ready ? 5 : 0) + (wideReady ? 5 : 0)} />}
    </main></SceneReturnContext.Provider></GameSurfaceContext.Provider></WardrobeContext.Provider>;
}
