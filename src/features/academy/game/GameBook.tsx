import { useEffect, useMemo, useRef, useState } from 'react';
import { useActivities } from '@/features/creative-activities/hooks/useActivities';
import { buildCategories } from '@/features/creative-activities/utils/categories';
import { GameModal } from './GameModal';
import { ActionScene } from './ActionScene';
import styles from './game.module.css';
import { GuideHint, guideMark } from './GuideHint';
import { libraryResearchContext, libraryResearchSeed, type LibraryResearchContext } from './newsResearchContext';
import { isCurrentStudentRecord, keywordLine, recordKeywords } from './libraryRecords';

/**
 * onResearch — 펼친 기록을 그대로 연구대(새 별 찾기)로 가져간다(2026-10-03, 엘리안·루온을 거치지 않는 직행 길).
 * 2026-10-22: 재학생(1·2·3학년) 기록은 책장에 꽂지 않고, 기록은 주제 대신 **키워드만** 보인다 — libraryRecords.ts.
 */
export function GameBook({ onClose, onRead, onResearch, busy, error, reduced, sound, initialActivityId }: { onClose: () => void; onRead?: (id: string) => void; onResearch?: (seed: string, context: LibraryResearchContext) => void; busy: boolean; error: string; reduced: boolean; sound: () => void; initialActivityId?: string | null }) {
  const list = useActivities();
  const [category, setCategory] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const content = useRef<HTMLElement>(null);
  const initialOpened = useRef<string | null>(null);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [activityId]);
  // 주제(활동 이름)로는 찾지 않는다 — 찾은 결과가 이름을 되짚게 하지 않도록 분야·키워드만.
  const shelf = useMemo(() => (list.data ?? []).filter(a => !isCurrentStudentRecord(a.academic_year)), [list.data]);
  const activities = useMemo(() => shelf.filter(a => `${a.career_fields.join(' ')} ${a.keywords.join(' ')}`.toLowerCase().includes(search.toLowerCase().trim())), [shelf, search]);
  const categories = useMemo(() => buildCategories(activities), [activities]);
  useEffect(() => {
    if (!initialActivityId || initialOpened.current === initialActivityId) return;
    const targetBook = categories.find(c => c.activityIds.includes(initialActivityId));
    if (targetBook) { initialOpened.current = initialActivityId; setCategory(targetBook.key); setActivityId(initialActivityId); setOpening(true); }
  }, [initialActivityId, categories]);
  const allCategories = useMemo(() => buildCategories(shelf), [shelf]);
  const book = allCategories.find(c => c.key === category);
  const searchField = <input aria-label="책장 활동 검색" placeholder="키워드나 분야로 찾기" value={search} onChange={e => setSearch(e.target.value)} />;
  const chapters = book ? activities.filter(a => book.activityIds.includes(a.id)) : [];
  const record = activityId ? shelf.find(a => a.id === activityId) ?? null : null;
  const keywords = record ? recordKeywords(record.keywords) : [];
  if (opening) return <ActionScene action="book" reduced={reduced} onComplete={() => { setOpening(false); setOpened(true); }} onCancel={() => setOpening(false)} />;
  return <GameModal title="왕립 도서관의 책장" onClose={onClose} className={`${styles.bookModal} ${book && opened ? styles.bookReading : ''}`} reduced={reduced}>
    {!book ? <div className={styles.shelfPanel}>
      <span className={styles.kicker}>THE ROYAL ARCHIVE</span><h2>당신을 기다린 이야기</h2><p>마음이 향하는 분야의 책을 꺼내 보세요.</p><GuideHint show={!!onRead}>엘리안 · 책등 하나를 눌러 꺼내요</GuideHint>
      {searchField}
      {list.isPending ? <p role="status">사서가 책을 찾아오고 있어요…</p> : list.isError ? <p role="alert">책장을 불러오지 못했어요. <button onClick={() => void list.refetch()}>다시 시도</button></p> : <div className={styles.bookRow}>{categories.map((c, i) => <button className={styles.spine} data-tone={i % 4} key={c.key} onClick={() => { sound(); setCategory(c.key); setOpened(false); }}><small>ROYAL ARCHIVE</small><strong>{c.label}</strong><span>✦</span><small>{c.count}개의 기록</small></button>)}</div>}
      {!list.isPending && !list.isError && !categories.length && <p>지금 열람할 수 있는 책이 없어요. 다른 검색어로 찾아보세요.</p>}
    </div> : !opened ? <div className={styles.coverStage}>
      {searchField}
      <button className={styles.bookCover} data-guide={guideMark(!!onRead)} onClick={() => { sound(); setOpening(true); }}><span>ROYAL ACADEMY</span><span className={styles.coverStar}>✧</span><h2>{book.label}</h2><span>표지를 눌러 책 펼치기 →</span></button>
      <GuideHint show={!!onRead}>엘리안 · 표지를 눌러 펼쳐요</GuideHint>
      <button className={styles.textButton} onClick={() => setCategory(null)}>다른 책 고르기</button>
    </div> : <div className={styles.openBook}>
      <aside><span className={styles.kicker}>TABLE OF CONTENTS</span><h2>{book.label}</h2>{searchField}{search.trim() && <small>이 책의 기록 {chapters.length}개 · 다른 분야는 책장에서 찾아보세요.</small>}{onRead && <p>엘리안 · 관심 가는 키워드 묶음을 골라 보세요. 다 보면 아래 반짝이는 «이 기록에서 나만의 질문 발견하기»를 눌러 주세요.</p>}<GuideHint show={!!onRead && !activityId}>엘리안 · 목차에서 하나 골라요</GuideHint><button className={styles.textButton} onClick={() => { setCategory(null); setActivityId(null); }}>← 책장으로</button>{!chapters.length && <p>이 책에 검색어와 맞는 기록이 없어요. 검색어를 바꾸거나 책장으로 돌아가 다른 분야를 찾아보세요.</p>}<ol tabIndex={0} aria-label="책 목차">{chapters.map((chapter, index) => <li key={chapter.id}><button aria-pressed={activityId === chapter.id} onClick={() => { sound(); setActivityId(chapter.id); }}><small>{String(index + 1).padStart(2, '0')}</small>{keywordLine(chapter.keywords, 4)}</button></li>)}</ol></aside>
      <article ref={content} tabIndex={0} aria-label="책 본문">{!activityId ? <div className={styles.readPrompt}><span>✧</span><h3>어떤 이야기가 궁금한가요?</h3><p>목차에서 기록을 고르면 그 기록의 키워드가 펼쳐집니다.</p></div> : !record ? <p>지금은 열람할 수 없는 기록입니다.</p> : <>
        <div key={activityId} className={styles.pageTurn}><span className={styles.kicker}>ARCHIVE · {record.academic_year}학년도</span><h2>이 기록의 키워드</h2>{keywords.length ? <ul className={styles.recordKeywords} aria-label="기록의 키워드">{keywords.map(word => <li key={word}>{word}</li>)}</ul> : <p>키워드가 없는 기록이에요. 목차에서 다른 기록을 골라 보세요.</p>}<p className={styles.recordKeywordsNote}>키워드에서 떠오른 나만의 궁금증을 찾아보세요.</p></div>
        {!!keywords.length && onRead && <><button className={styles.goldButton} data-guide={guideMark(!busy)} disabled={busy} onClick={() => onRead(activityId)}>{busy ? '기록 중…' : '이 기록에서 나만의 질문 발견하기 ✦'}</button><GuideHint show={!busy}>엘리안 · 다 봤으면 여기를 눌러요</GuideHint></>}
        {!!keywords.length && !onRead && onResearch && <div className={styles.bookToDesk}><p>이 키워드에서 궁금한 점이 생겼나요? 키워드를 들고 연구대로 가면 카시안 교수가 참고 자료로 함께 읽어요.</p><button className={styles.goldButton} disabled={busy} onClick={() => { sound(); const context = libraryResearchContext(record); onResearch(libraryResearchSeed(context), context); }}>이 키워드를 들고 연구대로 가기 →</button></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </>}</article>
    </div>}
  </GameModal>;
}
