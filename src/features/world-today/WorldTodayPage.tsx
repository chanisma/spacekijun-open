import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Compass, Feather, Globe2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { fetchWorldNews, NEWS_PAGE_SIZE } from './services/worldNewsService';
import { NEWS_CATEGORIES, type NewsArticle } from './types';
import { newsDate, sourceName, hasArticleComic, articleKeywords } from './utils/story';
import { StoryArt } from './components/StoryArt';
import { WorldStoryDialog } from './components/WorldStoryDialog';
import { ForMeSection } from './components/ForMeSection';
import { InterestDialog } from './components/InterestDialog';
import { useWorldInterests } from './hooks/useWorldInterests';
import { WORLD_FIELDS } from './utils/fields';
import styles from './world-today.module.css';

const SUBJECTS = ['과학', '수학', '정보', '사회', '국어', '영어', '기술가정', '진로'];

export default function WorldTodayPage() {
  const { user, profile, effectiveRole } = useAuth();
  const userId = user?.id ?? '';
  const preview = profile?.role === 'admin' && effectiveRole !== 'admin';
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [field, setField] = useState('');
  const [notebook, setNotebook] = useState(false);
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const listRef = useRef<HTMLElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const filters = { search: debouncedSearch, category, subject, field, page, notebook };
  // 관리자 미리보기에서는 관심 분야도 읽지 않는다(개인 일지와 같은 규칙 — 관리자 자신의 값이 학생 것처럼 보인다).
  const interests = useWorldInterests(userId, !preview);
  const interestOpen = !preview && params.get('interests') === '1';
  const setInterestOpen = (open: boolean) => setParams(current => {
    const next = new URLSearchParams(current);
    if (open) next.set('interests', '1'); else next.delete('interests');
    return next;
  }, { replace: !open });
  const feed = useQuery({
    queryKey: ['world-today', 'feed', userId, filters],
    queryFn: ({ signal }) => fetchWorldNews(filters, userId, signal),
    enabled: !!userId && !(preview && notebook),
    staleTime: 5 * 60 * 1000,
  });
  // 미리보기 전환 전 캐시에 있던 관리자 일지의 건수도 노출하지 않는다.
  const visibleFeed = preview && notebook ? undefined : feed.data;
  const articles = visibleFeed?.articles ?? [];
  const total = visibleFeed?.total ?? 0;
  const hasFilter = !!(search || category || subject || field);
  const featured = !notebook && !hasFilter && page === 0 ? articles[0] : null;
  const listed = featured ? articles.slice(1) : articles;
  const rawId = params.get('story') ?? '';
  const storyId = /^\d+$/.test(rawId) && Number.isSafeInteger(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : null;
  const openStory = (article: NewsArticle, trigger: HTMLButtonElement) => {
    lastTrigger.current = trigger;
    setParams(current => { const next = new URLSearchParams(current); next.set('story', String(article.id)); return next; });
  };
  const resetFilters = () => { setSearch(''); setCategory(''); setSubject(''); setField(''); setPage(0); };
  const changePage = (next: number) => { setPage(next); listRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); listRef.current?.focus({ preventScroll: true }); };
  return (
    <Layout>
      <div className={styles.world}>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5ded2] pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9c9ad] text-[#8a7150]"><Globe2 size={23} strokeWidth={1.2} /></span>
            <div><p className={styles.eyebrow}>THE WORLD OBSERVATORY</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#352a42]">요즘 세상</h1></div>
          </div>
          <div className="flex rounded-full border border-[#e4d9e8] bg-white/80 p-1 text-xs font-semibold">
            <button type="button" aria-pressed={!notebook} className={cn(styles.modeButton, !notebook && styles.modeActive)} onClick={() => { setNotebook(false); setPage(0); }}><Compass size={15} /> 세상 둘러보기</button>
            <button type="button" aria-pressed={notebook} className={cn(styles.modeButton, notebook && styles.modeActive)} onClick={() => { setNotebook(true); setPage(0); }}><Feather size={14} /> 내 관측 일지</button>
          </div>
        </header>

        <section className="py-6 sm:py-8" aria-label="관측소 안내">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-medium text-[#9a7f55]">리아와 루온의 탐구 아카데미</p>
              <h2 className="mt-2 text-xl font-bold leading-snug tracking-tight text-[#41344f] sm:text-3xl">{notebook ? '궁금했던 순간들이, 나의 탐구가 되도록.' : '세상은 매일, 새로운 질문을 보내온다.'}</h2>
              <p className="mt-3 text-sm leading-7 text-[#837889]">{notebook ? '담아 둔 소식을 다시 펼치고, 발견한 내용을 다음 장에 이어 써 보세요.' : '하나의 소식에서 시작해, 나만의 발견에 닿는 시간.'}</p>
            </div>
            <ol className="flex flex-wrap items-center gap-2 text-[11px] text-[#8e7a9b]" aria-label="관측의 흐름">
              {['발견', '이해', '질문', '탐구'].map((step, index) => <li key={step} className="flex items-center gap-2"><span className="rounded-full border border-[#e1d5e6] bg-white px-2.5 py-1.5">0{index + 1} {step}</span>{index < 3 && <span aria-hidden>·</span>}</li>)}
            </ol>
          </div>
        </section>

        {!preview && !notebook && !hasFilter && page === 0 && interests.isSuccess && (
          <ForMeSection userId={userId} saved={interests.saved} fields={interests.fields} onEdit={() => setInterestOpen(true)} onOpen={openStory} />
        )}

        {featured && (
          <section className={styles.featured} aria-label="가장 최근 도착한 관측 이야기">
            <div className="relative z-10 flex flex-col justify-center p-6 sm:p-9 lg:p-10">
              <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-[#d9be8c]"><Sparkles size={14} /> 가장 최근 도착한 관측 이야기</p>
              <p className="mt-5 text-xs text-[#c3b0d1]">관측 #{String(featured.id).padStart(3, '0')} · {featured.category}</p>
              <h3 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-[#fff8ec] sm:text-3xl">{featured.classroom_hook || featured.title}</h3>
              <p className="mt-4 line-clamp-2 text-sm leading-7 text-[#d1c5da]">{featured.why_it_matters || '리아와 루온이 도착한 소식의 의미를 함께 살펴보려 해요. 어떤 질문이 떠오르나요?'}</p>
              <p className="mt-4 text-[11px] text-[#b6a7c3]">{sourceName(featured.source)} · {newsDate(featured.published_at)}</p>
              <button type="button" className="mt-7 inline-flex min-h-11 w-fit items-center gap-3 rounded-full bg-[#ead6b1] px-5 py-3 text-sm font-semibold text-[#403044] transition-colors hover:bg-[#f4e4c7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#35273f]" onClick={event => openStory(featured, event.currentTarget)}>네 컷으로 이야기 펼치기 <ArrowRight size={16} /></button>
            </div>
            <div className="relative min-w-0"><StoryArt className="h-full min-h-64" /><div className={styles.artShade} aria-hidden /><span className="absolute bottom-4 right-5 text-[10px] text-white/75">리아 & 루온 · AI 생성 삽화</span></div>
          </section>
        )}

        <section ref={listRef} tabIndex={-1} className="scroll-mt-4 pt-8 outline-none" aria-label={notebook ? '저장한 관측 이야기' : '도착한 관측 이야기'}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#4b3a57]"><BookOpen size={18} />{notebook ? '내가 이어 쓰는 이야기' : featured ? '다음으로 펼쳐 볼 이야기' : '도착한 관측 이야기'}<span className="ml-1 text-xs font-normal text-[#9786a0]">{visibleFeed ? `${total}편` : ''}</span></h2>
            <button type="button" className={styles.textButton} disabled={feed.isFetching || (preview && notebook)} onClick={() => void feed.refetch()}><RefreshCw size={13} />{feed.isFetching ? '불러오는 중' : '새 소식 확인'}</button>
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e6ded4] bg-white/70 p-3">
            <label className="flex min-w-0 flex-[1_1_200px] items-center gap-2 rounded-xl bg-[#f5f1eb] px-3 text-[#9b8ea4]">
              <Search size={15} aria-hidden /><span className="sr-only">기사 제목 검색</span>
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} maxLength={100} placeholder="어떤 소식이 궁금한가요?" className="h-10 w-full bg-transparent text-xs text-[#4d4256] outline-none placeholder:text-[#9b8ea4] focus:ring-2 focus:ring-[#b39ac3]" />
            </label>
            <select aria-label="소식 분류" value={category} onChange={event => { setCategory(event.target.value); setPage(0); }} className={styles.select}><option value="">모든 소식</option>{NEWS_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select>
            <select aria-label="관련 교과" value={subject} onChange={event => { setSubject(event.target.value); setPage(0); }} className={styles.select}><option value="">모든 교과</option>{SUBJECTS.map(value => <option key={value}>{value}</option>)}</select>
            <select aria-label="관심 분야" value={field} onChange={event => { setField(event.target.value); setPage(0); }} className={styles.select}><option value="">모든 분야</option>{WORLD_FIELDS.map(value => <option key={value}>{value}</option>)}</select>
            {hasFilter && <button className={styles.textButton} onClick={resetFilters}>초기화</button>}
          </div>
          {preview && notebook ? <div className={styles.empty}>미리보기에서는 다른 학생이나 관리자의 개인 일지를 표시하지 않습니다.</div> : feed.isPending ? (
            <div role="status" className={styles.empty}><Compass size={28} className="mx-auto mb-3 text-[#ae95bb]" />관측소에 도착한 소식을 정리하고 있어요.</div>
          ) : feed.isError ? (
            <div role="alert" className={styles.empty}>소식을 불러오지 못했습니다.<button className="ml-2 underline" onClick={() => void feed.refetch()}>다시 시도</button></div>
          ) : articles.length === 0 ? (
            <div className={styles.empty}><Feather size={28} className="mx-auto mb-3 text-[#ae95bb]" />{hasFilter ? '이 조건에 맞는 이야기가 아직 없어요.' : notebook ? '아직 비어 있는 일지. 마음에 남는 소식 하나를 담아 보세요.' : '아직 관측소에 도착한 소식이 없어요.'}
              {(hasFilter || page > 0) && <button className="mt-3 block w-full text-[#775586] underline" onClick={resetFilters}>처음부터 보기</button>}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {listed.map(article => <NewsCard key={article.id} article={article} notebook={notebook} onOpen={openStory} />)}
              </div>
              {total > NEWS_PAGE_SIZE && <nav aria-label="소식 페이지" className="mt-7 flex items-center justify-center gap-4 text-xs text-[#80718c]">
                <button type="button" className={styles.pageButton} disabled={page === 0} onClick={() => changePage(page - 1)}>이전</button>
                <span>{page + 1} / {Math.ceil(total / NEWS_PAGE_SIZE)}</span>
                <button type="button" className={styles.pageButton} disabled={(page + 1) * NEWS_PAGE_SIZE >= total} onClick={() => changePage(page + 1)}>다음</button>
              </nav>}
            </>
          )}
        </section>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#e7dfd3] pt-5 text-[11px] leading-6 text-[#9a8ba2]">
          <span>매일 수집되는 소식 · 현재 AI와 과학·기술 소식을 중심으로 관측하고 있어요.</span>
          <span>발견은 함께, 질문은 나답게.</span>
        </footer>
      </div>
      {interestOpen && interests.isSuccess && (
        <InterestDialog userId={userId} saved={interests.saved} current={interests.fields} notify={interests.notify} onClose={() => setInterestOpen(false)} />
      )}
      {storyId && <WorldStoryDialog key={`${userId}:${storyId}`} id={storyId} userId={userId} readOnly={preview} onNavigate={nextId => {
        setParams(current => { const next = new URLSearchParams(current); next.set('story', String(nextId)); return next; }, { replace: true });
      }} onClose={() => {
        setParams(current => { const next = new URLSearchParams(current); next.delete('story'); return next; }, { replace: true });
        requestAnimationFrame(() => lastTrigger.current?.focus());
      }} />}
    </Layout>
  );
}

function NewsCard({ article, notebook, onOpen }: { article: NewsArticle; notebook: boolean; onOpen: (article: NewsArticle, trigger: HTMLButtonElement) => void }) {
  const keywords = articleKeywords(article);
  return (
    <article className={styles.newsCard}>
      <div className="flex items-center justify-between gap-3 text-[10px] font-medium"><span className="tracking-widest text-[#a28b68]">관측 #{String(article.id).padStart(3, '0')}</span><span className="flex items-center gap-1.5">{hasArticleComic(article) && <span className="rounded-full border border-[#e6c98f] bg-[#fff6e3] px-2.5 py-1 text-[#8a6a2e]" title="리아와 루온의 4컷 만화가 있는 소식">✦ 4컷 만화</span>}<span className="rounded-full bg-[#f1eaf5] px-2.5 py-1 text-[#887094]">{article.category}</span></span></div>
      <h3 className="mt-4 text-base font-bold leading-7 text-[#483652]">{article.classroom_hook || article.title}</h3>
      <p className="mt-2 line-clamp-2 text-xs leading-6 text-[#8d8193]">{article.why_it_matters || article.title}</p>
      {/* 두 줄은 다른 것을 말한다: 위는 목록을 거르는 축(교과, 닫힌 8종), 아래는 이 기사가
          실제로 다루는 말(핵심어, 기사마다 다름). 카드는 훑는 자리라 핵심어는 3개까지만 —
          전부는 이야기를 펼쳤을 때 보여 준다. */}
      <div className="mb-5 mt-4 space-y-1.5">
        {article.subjects.length > 0 && <div className="flex flex-wrap gap-1.5">{article.subjects.slice(0, 3).map(subject => <span key={subject} className="text-[10px] text-[#9c87a6]">#{subject}</span>)}</div>}
        {keywords.length > 0 && <p className="line-clamp-2 text-[10px] leading-5 text-[#7a7083]">{keywords.slice(0, 3).join(' · ')}</p>}
      </div>
      <div className="mt-auto flex items-end justify-between gap-2 border-t border-[#efe8e0] pt-4">
        <span className="text-[10px] leading-5 text-[#a396aa]">{sourceName(article.source)}<br />{newsDate(article.published_at)}</span>
        <button type="button" className={styles.textButton} aria-label={`${article.title} ${notebook ? '일지 이어 쓰기' : '이야기 펼치기'}`} onClick={event => onOpen(article, event.currentTarget)}>{notebook ? '일지 이어 쓰기' : '이야기 펼치기'}<ArrowRight size={14} /></button>
      </div>
    </article>
  );
}
