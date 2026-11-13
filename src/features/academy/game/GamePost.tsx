import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/use-debounce';
import { fetchWorldNews, fetchWorldArticle, fetchNewsInquiry, saveNewsInquiry, deleteNewsInquiry, NEWS_PAGE_SIZE } from '@/features/world-today/services/worldNewsService';
import { NEWS_CATEGORIES, type InquiryDraft, type NewsArticle } from '@/features/world-today/types';
import { comicImageUrl, comicPanels, EMPTY_INQUIRY, FIELD_LIMITS, inquiryPrompts, inquiryToText, newsDate, safeNewsUrl, sourceName } from '@/features/world-today/utils/story';
import { GameModal } from './GameModal';
import styles from './game.module.css';
import { GuideHint, guideMark } from './GuideHint';
import { newsResearchContext, type NewsResearchContext } from './newsResearchContext';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';

/** 펼쳐 본 편지 — 봉인이 뜯긴 봉투로 그린다. 서버에 «읽음» 상태가 없어 이 브라우저에만 기억한다(보기 편의, 최근 300통). */
const OPENED_KEY = 'academy-post-opened:v1';
const isIdList = (value: unknown): value is number[] => Array.isArray(value) && value.every(v => typeof v === 'number');

interface Props {
  onSaved?: () => void;
  chapterGuide?: { phase: 'read' | 'note'; letter: { id: number; title: string } | null; busy: boolean; error: string; onRead: (id: number) => Promise<void>; onNote: () => Promise<void>; onReturn: () => void; onRefresh: () => void };
  userId: string; readOnly: boolean; open: boolean; notebook: boolean; newsId: number | null;
  onNewsChange: (id: number | null) => void; onClose: () => void; reduced: boolean;
  onTalk?: (id: number) => void; onResearch: (text: string, context: NewsResearchContext) => void;
  conversationNote?: string; onNoteConsumed?: () => void;
}
export function GamePost(props: Props) {
  const outfit = useContext(WardrobeContext);
  const { userId, readOnly, open, notebook, newsId, onNewsChange, onClose, reduced } = props;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const drafts = useRef<Record<number, InquiryDraft>>({});
  const [opened, setOpened] = useState<number[]>(() => readStoredJson(OPENED_KEY, [], isIdList));
  const openLetter = (id: number) => { const next = [id, ...opened.filter(x => x !== id)].slice(0, 300); setOpened(next); writeStoredJson(OPENED_KEY, next); onNewsChange(id); };
  const filters = { search: useDebounce(search, 250), category, subject: '', page, notebook };
  const feed = useQuery({ queryKey: ['world-today', 'feed', userId, filters], queryFn: ({ signal }) => fetchWorldNews(filters, userId, signal), enabled: open && !!userId && !(readOnly && notebook), staleTime: 60_000 });
  useEffect(() => { setPage(0); }, [notebook]);
  if (!open) return null;
  return <GameModal title={notebook ? '우편국의 관측 일지' : '전서구의 편지함'} onClose={onClose} reduced={reduced} className={styles.postPanel}>
    {/* 머리글은 한 줄 — 종전엔 전신 초상·영문 머리말·제목·인용이 200px 를 차지해 편지함이 화면 아래로 밀렸다(2026-10-03). */}
    <header className={styles.postHead}><span className={styles.postPortrait}><img src={gameAsset(outfit.postmaster)} alt="배달부 노엘" /></span><div><h2>{notebook ? '내가 세상에 보낸 질문들' : '먼 세상에서 온 편지'}</h2><p>노엘 · “한 통의 편지에도 새로운 세계가 들어 있어.”</p></div></header>
    {props.chapterGuide && <aside className={styles.postChapterGuide} aria-label="노엘의 편지 안내"><strong>노엘 · {props.chapterGuide.phase === 'read' ? '네 컷 이야기가 담긴 가장 최근 편지' : '편지에서 떠오른 나의 질문'}</strong><p>{props.chapterGuide.phase === 'read' ? '이 편지를 펼쳐 그림과 기사를 읽어 봐. 다 읽으면 아래에서 나에게 알려 줘.' : '네가 직접 떠올린 질문을 먼저 적어 봐. 막막하면 기사 아래 질문 예시를 참고해도 좋아.'}</p>{props.chapterGuide.letter ? <><button className={styles.goldButton} data-guide={guideMark(!newsId)} onClick={() => onNewsChange(props.chapterGuide!.letter!.id)}>{props.chapterGuide.letter.title} · {props.chapterGuide.phase === 'read' ? '추천 편지 펼치기' : '일지 이어 쓰기'}</button><GuideHint show={!newsId}>노엘 · 이 편지부터 펼쳐</GuideHint></> : <p role="status">네 컷 편지를 준비하고 있어. <button onClick={props.chapterGuide.onRefresh}>편지 다시 확인하기</button></p>}<button className={styles.textButton} onClick={props.chapterGuide.onReturn}>노엘과 제4장 이야기 이어가기</button>{props.chapterGuide.error && <p role="alert">{props.chapterGuide.error}</p>}</aside>}
    {newsId ? <LetterReader key={`${userId}:${newsId}`} {...props} initialDraft={drafts.current[newsId]} rememberDraft={draft => { drafts.current[newsId] = draft; }} id={newsId} onBack={() => onNewsChange(null)} /> : <>
      <div className={`${styles.facilityTools} ${styles.postFilters}`}><input aria-label="편지 검색" placeholder="소식 제목으로 찾아보기" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><select aria-label="편지 분류" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="">모든 편지</option>{NEWS_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
      {readOnly && notebook ? <p>학생 계정에서 직접 남긴 관측 일지를 펼칠 수 있어요.</p> : feed.isPending ? <p role="status">전서구가 편지를 정리하고 있어요…</p> : feed.isError ? <p role="alert">편지함을 열지 못했어요. <button onClick={() => void feed.refetch()}>다시 시도</button></p> : <div className={styles.mailCabinet}><p className={styles.mailPlate}>{notebook ? '리아가 보낸 질문' : '리아의 칸'} · {feed.data?.total ?? 0}통{!notebook && feed.data ? ' · 안 읽은 편지 ' + feed.data.articles.filter(a => !opened.includes(a.id)).length + '통' : ''}</p><ul className={styles.mailSlots} aria-label={notebook ? '관측 일지' : '편지함'}>{feed.data?.articles.map(article => { const read = opened.includes(article.id); return <li key={article.id} className={styles.mailSlot}><button type="button" className={styles.mailEnvelope} data-read={read || undefined} onClick={() => openLetter(article.id)} aria-label={(read ? '읽은 편지 · ' : '새 편지 · ') + (article.classroom_hook || article.title)}><span className={styles.envelopeStamp} aria-hidden="true">{article.category}</span><span className={styles.envelopePostmark} aria-hidden="true">{newsDate(article.published_at)}</span><strong>{article.classroom_hook || article.title}</strong><small>{sourceName(article.source)}에서</small><span className={styles.envelopeSeal} aria-hidden="true">{read ? '' : '✦'}</span><em>{read ? '다시 읽기' : '봉인 뜯기'} →</em></button></li>; })}{Array.from({ length: Math.max(0, 6 - (feed.data?.articles.length ?? 0)) }, (_, i) => <li key={'empty-' + i} className={styles.mailSlot} data-empty="" aria-hidden="true" />)}</ul></div>}
      {!feed.isPending && !feed.isError && !feed.data?.articles.length && !(readOnly && notebook) && <p>이 칸에는 아직 편지가 없어요.</p>}
      {!!feed.data && feed.data.total > NEWS_PAGE_SIZE && <nav className={styles.pageControls} aria-label="편지함 페이지"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>앞 칸</button><span>{page + 1} / {Math.ceil(feed.data.total / NEWS_PAGE_SIZE)}</span><button disabled={(page + 1) * NEWS_PAGE_SIZE >= feed.data.total} onClick={() => setPage(p => p + 1)}>다음 칸</button></nav>}
    </>}
  </GameModal>;
}

function LetterReader({ onSaved, chapterGuide, id, userId, readOnly, onTalk, onResearch, onBack, conversationNote, onNoteConsumed, initialDraft, rememberDraft }: Props & { id: number; onBack: () => void; initialDraft?: InquiryDraft; rememberDraft: (draft: InquiryDraft) => void }) {
  const cache = useQueryClient();
  const article = useQuery({ queryKey: ['world-today', 'article', id], queryFn: ({ signal }) => fetchWorldArticle(id, signal) });
  const notes = useQuery({ queryKey: ['world-today', 'inquiry', userId, id], queryFn: () => fetchNewsInquiry(userId, id), enabled: !!userId && !readOnly });
  const [opened, setOpened] = useState(!!conversationNote || chapterGuide?.phase === 'note');
  const [draft, setDraft] = useState<InquiryDraft>(initialDraft ?? { ...EMPTY_INQUIRY });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hydrated = useRef(false);
  const saveLock = useRef(false);
  useEffect(() => { if (hydrated.current) rememberDraft(draft); }, [draft, rememberDraft]);
  useEffect(() => {
    if (hydrated.current || readOnly || notes.isPending || notes.isError) return;
    hydrated.current = true;
    setDraft({ question: notes.data?.question ?? '', prediction: notes.data?.prediction ?? '', plan: notes.data?.plan ?? '', reflection: notes.data?.reflection ?? '', ...initialDraft, ...(conversationNote ? { question: conversationNote.slice(0, FIELD_LIMITS.question) } : {}) });
    if (conversationNote) onNoteConsumed?.();
  }, [readOnly, notes.isPending, notes.isError, notes.data, conversationNote, onNoteConsumed, initialDraft]);
  async function save() {
    if (readOnly || saveLock.current || !draft.question.trim()) return;
    saveLock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await saveNewsInquiry(userId, id, draft);
      cache.setQueryData(['world-today', 'inquiry', userId, id], result);
      void cache.invalidateQueries({ queryKey: ['world-today', 'feed', userId] });
      onSaved?.();
      setNotice('노엘이 관측 일지를 보관했어요. 다음 방문에도 이어서 읽을 수 있어요.');
      if (chapterGuide?.phase === 'note' && chapterGuide.letter?.id === id) await chapterGuide.onNote();
    } catch { setError('관측 일지를 보관하지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.'); }
    finally { setBusy(false); saveLock.current = false; }
  }
  async function removeNote() {
    if (readOnly || saveLock.current || !notes.data) return;
    saveLock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await deleteNewsInquiry(userId, id);
      await cache.cancelQueries({ queryKey: ['world-today', 'inquiry', userId, id] });
      cache.setQueryData(['world-today', 'inquiry', userId, id], null);
      const empty = { ...EMPTY_INQUIRY };
      setDraft(empty); rememberDraft(empty); setConfirmDelete(false);
      void cache.invalidateQueries({ queryKey: ['world-today', 'feed', userId] });
      void cache.invalidateQueries({ queryKey: ['academy-chapter', userId] });
      onSaved?.();
      setNotice('관측 일지를 삭제했어요. 편지는 다시 읽고 새 질문을 남길 수 있어요.');
    } catch { setError('일지를 삭제하지 못했어요. 내용은 그대로 있으니 다시 시도해 주세요.'); }
    finally { setBusy(false); saveLock.current = false; }
  }
  if (article.isPending) return <p role="status">봉인된 편지를 찾고 있어요…</p>;
  if (article.isError) return <p role="alert">편지를 읽지 못했어요. <button onClick={() => void article.refetch()}>다시 시도</button></p>;
  if (!article.data) return <p>지금은 읽을 수 없는 편지입니다. <button onClick={onBack}>편지함으로 돌아가기</button></p>;
  const news = article.data;
  const url = safeNewsUrl(news.url);
  // 장 안내의 편지인가 — 장은 그 편지에서 한 일만 받는다. 다른 편지에 일지를 적으면 저장은 되지만 이야기는 넘어가지 않는다.
  const guided = !!chapterGuide && !readOnly && chapterGuide.letter?.id === id;
  const elsewhere = !!chapterGuide && !readOnly && !!chapterGuide.letter && chapterGuide.letter.id !== id;
  return <>
    <button className={styles.textButton} onClick={onBack}>← 편지함으로</button>
    {elsewhere && <p className={styles.postChapterGuide} role="note">노엘 · 이 편지도 좋지만, 이야기를 이어가려면 «{chapterGuide!.letter!.title}» 편지에서 {chapterGuide!.phase === 'read' ? '그림과 기사를 읽어' : '질문을 적어'} 줘. 편지함 위 안내의 단추로 바로 펼칠 수 있어.</p>}
    {!opened ? <><button className={`${styles.envelope} ${styles.sealedLetter}`} data-guide={guideMark(guided)} onClick={() => setOpened(true)}><small>TO. RIA</small><span>✦</span><h2>{news.title}</h2><strong>봉인을 떼고 편지 펼치기</strong></button><GuideHint show={guided}>노엘 · 봉인을 눌러 펼쳐</GuideHint></> : <div className={styles.letterOpen}>
      <article><span className={styles.kicker}>{sourceName(news.source)} · {newsDate(news.published_at)}</span><h2>{news.title}</h2><p className={styles.letterHook}>{news.classroom_hook}</p><h3>세상에서는 이런 일이</h3><p className={styles.prose}>{news.summary || '수집된 발췌가 없습니다. 원문에서 내용을 확인해 보세요.'}</p><h3>우리에게 어떤 의미일까?</h3><p>{news.why_it_matters || '내 관심 분야에 어떤 영향을 줄지 생각해 보세요.'}</p><ArticleComic article={news} />{url && <a className={styles.textButton} href={url} target="_blank" rel="noopener noreferrer">기사의 원문 확인 ↗</a>}
        <div className={styles.articleQuestions}><h3>리아의 다음 질문</h3>{inquiryPrompts(news).map(q => <button key={q} onClick={() => { setDraft(d => ({ ...d, question: q.slice(0, FIELD_LIMITS.question) })); setNotice(''); }} disabled={readOnly || notes.isPending || notes.isError}>{q}</button>)}</div>
        {onTalk && <button className={styles.goldButton} disabled={readOnly} onClick={() => onTalk(id)}>노엘과 이 기사에 대해 이야기하기 · AI</button>}
        {chapterGuide?.phase === 'read' && chapterGuide.letter?.id === id && <><button className={styles.goldButton} data-guide={guideMark(guided && !chapterGuide.busy)} disabled={readOnly || chapterGuide.busy} onClick={() => void chapterGuide.onRead(id)}>그림과 기사를 읽었어요 · 노엘과 이야기하기</button><GuideHint show={guided && !chapterGuide.busy}>노엘 · 다 읽었으면 여기를 눌러</GuideHint></>}
      </article>
      <section className={styles.newsNotebook} aria-label="나의 기사 관측 일지"><span className={styles.kicker}>RIA'S OBSERVATION JOURNAL</span><h3>세상을 향한 나의 질문</h3>
        {notes.isError && !readOnly && <p role="alert">저장된 일지를 읽지 못했어요. <button onClick={() => void notes.refetch()}>다시 시도</button></p>}
        {readOnly && <p>학생 계정에서 나의 질문을 기록하고 대화할 수 있어요.</p>}
        {([['question', '나의 질문'], ['prediction', '예상과 이유'], ['plan', '확인할 방법'], ['reflection', '발견과 새 질문']] as const).map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} value={draft[key]} maxLength={FIELD_LIMITS[key]} disabled={readOnly || busy || notes.isPending || notes.isError} onChange={e => { setDraft(d => ({ ...d, [key]: e.target.value })); setNotice(''); }} /><small>{draft[key].length} / {FIELD_LIMITS[key]}</small></label>)}
        <button className={styles.goldButton} data-guide={guideMark(guided && chapterGuide?.phase === 'note')} disabled={readOnly || busy || !draft.question.trim() || notes.isPending || notes.isError || confirmDelete} onClick={() => void save()}>{busy ? '일지를 정리하는 중…' : '노엘에게 관측 일지 보관 부탁하기'}</button>
        <GuideHint show={guided && chapterGuide?.phase === 'note'}>{draft.question.trim() ? '노엘 · 질문을 적었으면 여기를 눌러' : '노엘 · «나의 질문»을 먼저 적어 줘'}</GuideHint>
        {!readOnly && notes.data && <div className={styles.noteDelete}>{confirmDelete ? <div role="group" aria-label="관측 일지 삭제 확인"><p>이 편지에 저장한 관측 일지를 삭제할까요? 작성한 질문과 예상, 확인 방법, 발견 내용이 모두 지워져요.</p><button className={styles.textButton} disabled={busy} onClick={() => void removeNote()}>관측 일지 삭제 확정</button><button className={styles.textButton} disabled={busy} onClick={() => setConfirmDelete(false)}>취소</button></div> : <button className={styles.textButton} disabled={busy || notes.isPending || notes.isError} onClick={() => setConfirmDelete(true)}>관측 일지 삭제하기</button>}</div>}
        {!chapterGuide && <button className={styles.mapButton} disabled={!draft.question.trim() || readOnly || busy} onClick={() => onResearch(inquiryToText(news, draft), newsResearchContext(news, draft))}>이 질문을 들고 연구시설로 가기 →</button>}
        {notice && <p role="status">{notice}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
      </section>
    </div>}
  </>;
}
function ArticleComic({ article }: { article: NewsArticle }) {
  const [failed, setFailed] = useState(false);
  const image = comicImageUrl(article, path => supabase.storage.from('world-today-comics').getPublicUrl(path).data.publicUrl);
  const panels = comicPanels(article);
  if (!image && !panels.length) return null;
  return <section className={styles.comicInsert}><h3>편지에 동봉된 네 컷 이야기</h3>{image && !failed && <img src={image} alt={`${article.title} 기사 만화`} onError={() => setFailed(true)} />} {!!panels.length && <details open={failed}><summary>동봉된 이야기 글로 읽기</summary>{panels.map((p, i) => <div key={i}><strong>{p.title}</strong>{p.dialogue.map((line, j) => <p key={j}>{line}</p>)}</div>)}</details>}</section>;
}
