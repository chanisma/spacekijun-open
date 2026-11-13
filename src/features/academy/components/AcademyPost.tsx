import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bird, Mail, Search } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDebounce } from '@/hooks/use-debounce';
import { fetchWorldNews, NEWS_PAGE_SIZE } from '@/features/world-today/services/worldNewsService';
import { NEWS_CATEGORIES } from '@/features/world-today/types';
import { newsDate, sourceName } from '@/features/world-today/utils/story';
import { WorldStoryDialog } from '@/features/world-today/components/WorldStoryDialog';
import styles from '../academy.module.css';

export function AcademyPost() {
  const { user, profile, effectiveRole } = useAuth();
  const userId = user?.id ?? '';
  const preview = profile?.role === 'admin' && effectiveRole !== 'admin';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [notebook, setNotebook] = useState(false);
  const [page, setPage] = useState(0);
  const [story, setStory] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const filters = { search: useDebounce(search, 300), category, subject: '', page, notebook };
  const feed = useQuery({ queryKey: ['world-today', 'feed', userId, filters], queryFn: ({ signal }) => fetchWorldNews(filters, userId, signal), enabled: !!userId && !(preview && notebook), staleTime: 300_000 });
  const data = preview && notebook ? undefined : feed.data;
  return <>
    <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>PIGEON POST · 요즘 세상</p><h1>먼 세상에서 편지가 도착했어요.</h1><p>봉인을 열어 소식을 읽고, 세상을 향한 나의 질문을 남겨 보세요.</p></div><Bird size={52} strokeWidth={1} /></div>
    <div className={styles.toolbar}><label className={styles.search}><Search size={17} /><input aria-label="편지 검색" placeholder="어떤 소식이 궁금한가요?" value={search} maxLength={100} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label><select aria-label="편지 분류" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="">모든 소식</option>{NEWS_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select><button aria-pressed={notebook} className={styles.primaryButton} onClick={() => { setNotebook(!notebook); setPage(0); }}>{notebook ? '모든 편지 보기' : '내 관측 일지'}</button><Link to="/world-today">요즘 세상에서 보기 ↗</Link></div>
    {preview && notebook ? <p className={styles.empty}>미리보기에서는 개인 관측 일지를 표시하지 않습니다.</p> : feed.isPending ? <p role="status" className={styles.empty}>전서구가 편지를 가져오고 있어요…</p> : feed.isError ? <p role="alert" className={styles.empty}>편지를 불러오지 못했어요. <button onClick={() => void feed.refetch()}>다시 시도</button></p> : !data?.articles.length ? <p className={styles.empty}>{notebook ? '소식을 읽고 나의 질문을 일지에 남겨 보세요.' : '조건에 맞는 편지가 아직 없어요.'}</p> : <div className={styles.letters}>{data.articles.map(article => <button key={article.id} className={styles.letter} onClick={e => { trigger.current = e.currentTarget; setStory(article.id); }}><span className={styles.letterHead}><small>{article.category} · {newsDate(article.published_at)}</small><Mail size={23} strokeWidth={1} /></span><span className={styles.seal}>✦</span><h2>{article.classroom_hook || article.title}</h2><p>{article.why_it_matters || article.title}</p><span className={styles.letterHead}><small>FROM. {sourceName(article.source)}</small><strong>봉인 열기 →</strong></span></button>)}</div>}
    {!!data && data.total > NEWS_PAGE_SIZE && <nav className={styles.pagination} aria-label="편지 페이지"><button disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1} / {Math.ceil(data.total / NEWS_PAGE_SIZE)}</span><button disabled={(page + 1) * NEWS_PAGE_SIZE >= data.total} onClick={() => setPage(page + 1)}>다음</button></nav>}
    {story && <WorldStoryDialog key={`${userId}:${story}`} id={story} userId={userId} readOnly={preview} designPath="/academy/observatory" onNavigate={setStory} onClose={() => { setStory(null); requestAnimationFrame(() => trigger.current?.focus()); }} />}
  </>;
}
