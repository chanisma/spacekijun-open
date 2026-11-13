import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Feather, Search } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useActivities, useActivity } from '@/features/creative-activities/hooks/useActivities';
import { useActivityAccess } from '@/features/creative-activities/hooks/useActivityAccess';
import { useCreateProposal } from '@/features/creative-activities/hooks/useActivityProposals';
import { ProposalFormDialog } from '@/features/creative-activities/components/ProposalFormDialog';
import { buildCategories } from '@/features/creative-activities/utils/categories';
import styles from '../academy.module.css';

export function AcademyLibrary() {
  const { profile, effectiveRole } = useAuth();
  const access = useActivityAccess();
  const preview = profile?.role === 'admin' && effectiveRole !== 'admin';
  const list = useActivities();
  const [search, setSearch] = useState('');
  const [bookKey, setBookKey] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const proposal = useCreateProposal();
  const detail = useActivity(activityId);
  const activities = useMemo(() => (list.data ?? []).filter(a => `${a.name} ${a.career_fields.join(' ')} ${a.keywords.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())), [list.data, search]);
  const books = useMemo(() => buildCategories(activities), [activities]);
  const book = books.find(b => b.key === bookKey);
  const chapters = book ? activities.filter(a => book.activityIds.includes(a.id)) : [];

  return <>
    <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>THE ROYAL LIBRARY · 창체 아카이브</p><h1>책 한 권에서 시작되는 모험</h1><p>분야의 책을 꺼내고, 목차에서 궁금한 활동을 펼쳐 보세요.</p></div><button className={styles.primaryButton} disabled={preview || access.isLoading} onClick={() => setProposing(true)}><Feather size={16} /> 새 내용 제안하기</button></div>
    <div className={styles.toolbar}><label className={styles.search}><Search size={17} /><input aria-label="도서관 활동 검색" placeholder="활동 이름, 분야, 키워드 검색" value={search} onChange={e => { setSearch(e.target.value); setActivityId(null); }} /></label><Link to="/activities">창체 아카이브에서 보기 ↗</Link><Link to="/activities?scope=proposals">제안함 보기 ↗</Link></div>
    {list.isPending ? <p className={styles.empty} role="status">사서가 책을 정리하고 있어요…</p> : list.isError ? <p className={styles.empty} role="alert">책장을 불러오지 못했어요. <button onClick={() => void list.refetch()}>다시 시도</button></p> : !books.length ? <p className={styles.empty}>조건에 맞는 책이 아직 없어요.</p> : <>
      <div className={styles.bookshelf} aria-label="관심 분야 책장">{books.map((b, i) => <button key={b.key} className={styles.book} data-tone={i % 5} aria-pressed={bookKey === b.key} onClick={() => { setBookKey(b.key); setActivityId(null); }}><span>ROYAL ARCHIVE</span><BookOpen size={24} strokeWidth={1} /><strong>{b.label}</strong><small>{b.count}개의 이야기</small><span>✦</span></button>)}</div>
      {book ? <section className={styles.openBook} aria-label={`${book.label} 목차와 본문`}>
        <aside><p className={styles.eyebrow}>TABLE OF CONTENTS</p><h2>{book.label}</h2><p className={styles.muted}>읽고 싶은 장을 선택하세요.</p><ol className={styles.chapters}>{chapters.map((a, i) => <li key={a.id}><button aria-pressed={activityId === a.id} onClick={() => setActivityId(a.id)}><span>{String(i + 1).padStart(2, '0')}</span><span>{a.name}<small>{a.academic_year}년 · {a.related_subjects.join(', ') || '창의적 체험활동'}</small></span></button></li>)}</ol></aside>
        <article aria-live="polite">{!activityId ? <div className={styles.readingEmpty}><BookOpen size={40} strokeWidth={1} /><h3>새로운 페이지를 펼쳐 볼까요?</h3><p>왼쪽 목차의 활동을 고르면 이야기가 시작됩니다.</p></div> : detail.isPending ? <p role="status">본문을 펼치는 중…</p> : detail.isError ? <p role="alert">본문을 불러오지 못했어요. <button onClick={() => void detail.refetch()}>다시 시도</button></p> : !detail.data ? <p>열람할 수 없는 활동입니다.</p> : <><p className={styles.eyebrow}>ARCHIVE · {detail.data.academic_year}</p><h2>{detail.data.name}</h2>{[['활동의 시작', detail.data.purpose], ['탐구와 활동', detail.data.content], ['발견과 성과', detail.data.outcome]].map(([label, text]) => <section className={styles.chapterBody} key={label}><h3>{label}</h3><p>{text || '아직 기록된 내용이 없습니다.'}</p></section>)}<Link className={styles.primaryButton} to={`/activities?activity=${encodeURIComponent(activityId)}`}>활동 상세 · 참여 · 계보 보기 ↗</Link></>}</article>
      </section> : <p className={styles.shelfHint}>✦ 책을 꺼내면 이곳에 목차가 펼쳐집니다.</p>}
    </>}
    {preview && <p className={styles.muted}>역할 미리보기에서는 새 제안을 작성할 수 없습니다.</p>}
    <ProposalFormDialog open={proposing && !preview} onOpenChange={setProposing} myStudentCode={access.myStudentCode} isSubmitting={proposal.isPending} onSubmit={async input => { if (preview) return; await proposal.mutateAsync(input); setProposing(false); }} />
  </>;
}
