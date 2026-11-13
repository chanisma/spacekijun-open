import { useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GameModal } from './GameModal';
import { gameAsset } from './gameAsset';
import { WardrobeContext } from './wardrobeContext';
import { cardProgress, groupBooksByDepartment, groupBooksByField, spineOf, validateReadingCard, type BookRecommendation, type BookShelf, type ReadingCard, type ReadingCardDraft } from './readingModel';
import styles from './game.module.css';
import css from './reading.module.css';
import { GuideHint, guideMark } from './GuideHint';

export type ShelfMode = 'browse' | 'pickBook' | 'newCard';
/**
 * 세린의 서가 (2026-10-03 개편 — «목록 화면» → 실제 책장).
 * 두 장은 그대로다: 「추천 서가」(분야 → 책, 제6장에서는 한 권 담기)와 「설명 카드」(한 장 = 생각 하나).
 * 바뀐 것은 손에 잡히는 방식이다:
 *  · 추천 서가 = 나무 책장. 놋쇠 명판으로 서가(고전 100선·학과별)를, 칸 이름표로 분야를 고르고, **책등을 눌러 한 권을 꺼낸다**
 *    → 옆 독서대에 표지가 놓이고 거기서 «담기»·«카드 적기». 책등 색·높이는 책마다 고정(`spineOf`).
 *  · 설명 카드 = 카드 서랍. 색인 카드가 꽂혀 있고, 누르면 줄 친 카드가 펼쳐진다.
 *  · 세린이 곁에서 지금 할 일 하나를 말한다(플래너의 리아와 같은 자리).
 * 카드 양식은 네 칸이지만 **«알고 싶은 것» 하나만 필수**다(2026-10-03 사용자 정정) — 설명은 읽은 뒤의 일이라 접어 둔다.
 */
export function ReadingShelf({ open, mode, chapter, books, booksError, cards, busy, error, readOnly, reduced, chapterBookTitle, onClose, onRetryBooks, onPickBook, onSaveCard, onDeleteCard }: {
  open: boolean; mode: ShelfMode;
  /** 제6장이 지금 이 서가의 조작을 기다리는가 — 그때만 눌러야 할 단추를 반짝여 가리킨다(GuideHint). */
  chapter?: boolean; books: BookRecommendation[] | undefined; booksError: boolean; cards: ReadingCard[]; busy: boolean; error: string; readOnly: boolean; reduced: boolean;
  chapterBookTitle: string | null; onClose: () => void; onRetryBooks: () => void;
  onPickBook: (book: BookRecommendation) => Promise<void>; onSaveCard: (draft: ReadingCardDraft, id?: string | null) => Promise<ReadingCard | null>; onDeleteCard: (id: string) => Promise<void>;
}) {
  const worn = useContext(WardrobeContext);
  const [tab, setTab] = useState<'shelf' | 'cards'>(mode === 'newCard' ? 'cards' : 'shelf');
  const [shelf, setShelf] = useState<BookShelf>('classic');
  const [field, setField] = useState<string | null>(null);
  const [pulled, setPulled] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(mode === 'newCard' ? 'new' : null);
  const [draft, setDraft] = useState<ReadingCardDraft>({ book_title: chapterBookTitle ?? '', concept: '', explanation: '', stuck: '', simplified: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  useEffect(() => { if (open) { setTab(mode === 'newCard' ? 'cards' : 'shelf'); setEditing(mode === 'newCard' ? 'new' : null); setDraft({ book_title: chapterBookTitle ?? '', concept: '', explanation: '', stuck: '', simplified: '' }); setLocalError(''); setConfirmDelete(null); setPulled(null); } }, [open, mode, chapterBookTitle]);
  const groups = useMemo(() => groupBooksByField(books ?? [], shelf), [books, shelf]);
  const activeGroup = groups.find(g => g.key === field) ?? groups.find(g => g.books.length) ?? groups[0];
  if (!open) return null;
  const pulledBook = activeGroup?.books.find(b => b.id === pulled) ?? null;
  const startCard = (book?: BookRecommendation) => { setDraft({ book_id: book?.id ?? null, book_title: book?.title ?? chapterBookTitle ?? '', concept: '', explanation: '', stuck: '', simplified: '' }); setEditing('new'); setTab('cards'); setLocalError(''); };
  const editCard = (card: ReadingCard) => { setDraft({ book_id: card.book_id, book_title: card.book_title, concept: card.concept, explanation: card.explanation, stuck: card.stuck, simplified: card.simplified }); setEditing(card.id); setTab('cards'); setLocalError(''); };
  const pickGroup = (key: string) => { setField(key); setPulled(null); };
  const serinLine = mode === 'pickBook' ? '“오늘은 한 권만 «읽어 볼 책»으로 담아 두면 돼요. 읽는 건 천천히.”'
    : mode === 'newCard' && editing ? '“이번 독서로 알고 싶은 것 하나만 적어요. 설명은 읽고 나서예요.”'
      : tab === 'shelf' ? (pulledBook ? `“「${pulledBook.title}」… 마음이 가면 그 책으로 카드를 한 장 적어 봐요.”` : '“책등을 눌러 한 권 꺼내 보세요. 제목이 끌리는 것부터요.”')
        : editing ? (editing === 'new' ? '“알고 싶은 것 하나만 적으면 꽂혀요. 나머지는 읽고 나서.”' : '“다시 펼친 카드예요. 책을 덮고 내 말로 설명해 볼래요?”')
          : cards.length ? '“설명이 비어 있는 카드부터 펼쳐 봐요. 한 주에 한 장이면 충분해요.”' : '“첫 카드는 생각 하나면 돼요. 어려운 책일수록 한 번에 한 가지만.”';
  // 장 안내: «읽어 볼 책 담기»(pickBook)와 «새 카드 꽂기»(newCard)만 장을 넘긴다 — 있던 카드를 고쳐 저장하면 저장은 되지만 이야기는 그대로다.
  const guiding = !!chapter && !readOnly && !busy;
  const guidePick = guiding && mode === 'pickBook', guideCard = guiding && mode === 'newCard';
  const sections = shelf === 'major' ? groupBooksByDepartment(activeGroup?.books ?? []) : [{ department: '', source: null, books: activeGroup?.books ?? [] }];

  return <GameModal title="세린의 서가" reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={css.shelf}>
    <header className={css.head}>
      <div><span className={css.kicker}>SERIN'S SHELF · 설명할 수 있을 때까지</span><h2>{tab === 'shelf' ? '추천 서가' : '설명 카드'}</h2></div>
      <figure className={css.serin}><span className={css.portrait}><img src={gameAsset(worn.serin)} alt="" /></span><figcaption role="status"><b>세린</b> {serinLine}</figcaption></figure>
    </header>
    <nav className={css.tabs} aria-label="서가 구분">
      <button type="button" aria-pressed={tab === 'shelf'} disabled={busy} onClick={() => setTab('shelf')}><span aria-hidden="true">▤</span>추천 서가</button>
      <button type="button" aria-pressed={tab === 'cards'} disabled={busy} onClick={() => setTab('cards')}><span aria-hidden="true">❧</span>설명 카드 · {cards.length}</button>
    </nav>
    {readOnly && <p className={css.notice}>학생 시점 열람 · 책 담기와 설명 카드는 학생 본인만 기록할 수 있어요.</p>}

    {tab === 'shelf' && <section className={css.library} aria-label="추천 서가">
      {booksError ? <p role="alert" className={css.paperNote}>추천 서가를 불러오지 못했어요. <button type="button" className={styles.textButton} onClick={onRetryBooks}>다시 펼치기</button></p> : !books ? <p role="status" className={css.paperNote}>엘리안이 서가를 정리하고 있어요…</p> : <>
        <div className={css.case}>
          {/* 서가 둘 — 고전(분야)과 학과별(계열 → 학과). 놋쇠 명판. */}
          <div className={css.plaques} role="tablist" aria-label="서가 고르기">
            <button type="button" role="tab" aria-selected={shelf === 'classic'} disabled={busy} onClick={() => { setShelf('classic'); setField(null); setPulled(null); }}>고전 100선<small>분야별</small></button>
            <button type="button" role="tab" aria-selected={shelf === 'major'} disabled={busy} onClick={() => { setShelf('major'); setField(null); setPulled(null); }}>학과별 추천<small>가고 싶은 학과로</small></button>
          </div>
          <div className={css.labels} role="tablist" aria-label={shelf === 'major' ? '계열' : '분야'}>{groups.filter(g => g.books.length).map(g => <button key={g.key} type="button" role="tab" aria-selected={activeGroup?.key === g.key} disabled={busy} onClick={() => pickGroup(g.key)}>{g.label}<small>{g.books.length}</small></button>)}</div>
          {activeGroup && <p className={css.caseHint}>{activeGroup.hint}{shelf === 'classic' && activeGroup.books[0]?.source ? ` · 출처: ${activeGroup.books[0].source}` : ''}</p>}
          <div className={css.shelves}>
            {sections.map(section => <section key={section.department || 'all'} className={css.row} aria-label={section.department || activeGroup?.label}>
              {section.department && <h3>{section.department}<small>{section.department.startsWith('서울대') ? '지원자가 가장 많이 읽은 책' : '학과가 추천한 책'}</small></h3>}
              <ul className={css.spines}>{section.books.map(book => { const spine = spineOf(book); const chosen = chapterBookTitle === book.title;
                return <li key={book.id} data-chosen={chosen || undefined}>
                  <button type="button" className={css.spine} data-band={spine.band} aria-pressed={pulled === book.id} aria-label={`${book.title} 꺼내 보기`} disabled={busy}
                    style={{ ['--tone' as string]: spine.tone, height: `${spine.height}%`, width: spine.width } as CSSProperties}
                    onClick={() => setPulled(p => p === book.id ? null : book.id)}><span>{book.title}</span></button>
                </li>; })}</ul>
            </section>)}
          </div>
          {shelf === 'major' && <p className={css.sourceNote}>출처 · 고려대학교 도서관 «학과별 권장도서»(학과가 추천) · 서울대 입학본부 웹진 아로리 «단과대학별 지원자가 가장 많이 읽은 책»(2014~2022학년도, 추천이 아니라 실제로 많이 읽힌 책)</p>}
        </div>
        <aside className={css.lectern} aria-label="꺼낸 책">
          {pulledBook ? <article key={pulledBook.id} className={css.cover} style={{ ['--tone' as string]: spineOf(pulledBook).tone } as CSSProperties}>
            <span className={css.coverStar} aria-hidden="true">✧</span>
            <h3>{pulledBook.title}</h3>
            {pulledBook.author && <p className={css.author}>{pulledBook.author}</p>}
            {pulledBook.note && <p className={css.note}>{pulledBook.note}</p>}
            {(pulledBook.department || pulledBook.source) && <p className={css.source}>{pulledBook.department ?? pulledBook.source}</p>}
            {chapterBookTitle === pulledBook.title && <p className={css.chosenTag}>✦ 읽어 볼 책으로 담았어요</p>}
            <div className={css.coverActions}>
              {mode === 'pickBook' ? <button type="button" className={styles.goldButton} data-guide={guideMark(guidePick)} disabled={busy || readOnly} onClick={() => void onPickBook(pulledBook)}>읽어 볼 책으로 담기</button>
                : <button type="button" className={styles.goldButton} data-guide={guideMark(guideCard)} disabled={busy || readOnly} onClick={() => startCard(pulledBook)}>이 책으로 카드 적기</button>}
              <GuideHint show={guidePick || guideCard}>세린 · 여기를 눌러요</GuideHint>
              <button type="button" className={css.putBack} disabled={busy} onClick={() => setPulled(null)}>책장에 다시 꽂기</button>
            </div>
          </article> : <div className={css.lecternEmpty}><span aria-hidden="true">❦</span><p>책등을 눌러 한 권 꺼내면<br />여기 독서대에 펼쳐져요.</p><GuideHint show={guidePick || guideCard}>세린 · 책등 하나를 눌러 꺼내요</GuideHint></div>}
        </aside>
      </>}
    </section>}

    {tab === 'cards' && <section className={css.drawerScene} aria-label="설명 카드">
      {editing ? <form className={css.indexCard} onSubmit={e => { e.preventDefault(); const problem = validateReadingCard(draft); if (problem) { setLocalError(problem); return; } setLocalError(''); void onSaveCard(draft, editing === 'new' ? null : editing).then(saved => { if (saved) { setEditing(null); setConfirmDelete(null); } }); }}>
        <label className={css.cardTitle}>어떤 책(또는 글)인가요?<input value={draft.book_title} maxLength={200} disabled={busy || readOnly} onChange={e => setDraft({ ...draft, book_title: e.target.value })} placeholder="책 제목, 교과서 단원, 읽던 글 — 뭐든 좋아요" /></label>
        <label>① 이번 독서로 알고 싶은 것 하나 <small>읽기 전에 정해요 · 이것만 적으면 카드가 꽂혀요</small><input className={css.ink} value={draft.concept} maxLength={200} disabled={busy || readOnly} onChange={e => setDraft({ ...draft, concept: e.target.value })} placeholder="예: 엔트로피는 왜 늘어나기만 할까" /></label>
        {/* 설명은 읽은 «뒤»의 일이다 — 새 카드에서는 접어 두고, 다시 펼친 카드에서는 다음 할 일이라 열어 둔다. */}
        <details open={!!(draft.explanation || draft.stuck || draft.simplified) || editing !== 'new'}><summary>② 설명 · ③ 막힌 곳 · ④ 다듬기 <small>읽고 나서 다시 펼쳐 채워요 — 지금은 비워 두어도 돼요</small></summary>
          <label>② 책을 덮고, 내 말로 설명하기 <small>어린 동생에게 말하듯</small><textarea className={css.ink} value={draft.explanation} maxLength={1000} disabled={busy || readOnly} onChange={e => setDraft({ ...draft, explanation: e.target.value })} placeholder="책의 문장을 베끼지 말고, 지금 머릿속에 남은 대로 적어 보세요. 중간이 비면 비는 대로요." /></label>
          <label>③ 설명하다 막힌 곳<textarea className={css.ink} value={draft.stuck ?? ''} maxLength={500} disabled={busy || readOnly} onChange={e => setDraft({ ...draft, stuck: e.target.value })} placeholder="어디서 말이 끊겼나요? 다음에 책을 펼치면 거기부터 읽어요." /></label>
          <label>④ 막힌 곳을 다시 읽고, 더 쉬운 말이나 비유로<textarea className={css.ink} value={draft.simplified ?? ''} maxLength={1000} disabled={busy || readOnly} onChange={e => setDraft({ ...draft, simplified: e.target.value })} placeholder="두 번째 설명. 처음보다 짧고 쉬워졌다면 성공이에요." /></label>
        </details>
        {(localError || error) && <p role="alert" className={styles.error}>{localError || error}</p>}
        {guideCard && editing !== 'new' && <p className={css.notice} role="note">세린 · 이 카드는 고쳐 저장해도 좋아요. 다만 이야기를 이어가려면 «서랍으로» 돌아가 «＋ 새 설명 카드»로 새 카드를 한 장 꽂아 주세요.</p>}
        <div className={css.formActions}><button type="submit" className={styles.goldButton} data-guide={guideMark(guideCard && editing === 'new')} disabled={busy || readOnly}>{busy ? '서가에 꽂는 중…' : editing === 'new' ? mode === 'newCard' ? '첫 카드 꽂고 세린에게 보여 주기' : '카드 꽂기' : '카드 고치기'}</button><button type="button" className={styles.textButton} disabled={busy} onClick={() => { setEditing(null); setLocalError(''); }}>서랍으로</button><GuideHint show={guideCard && editing === 'new'}>{draft.concept.trim() ? '세린 · 여기를 눌러요' : '세린 · ①을 먼저 적어요'}</GuideHint></div>
      </form> : <div className={css.drawer}>
        <div className={css.drawerFront}><span className={css.handle} aria-hidden="true" /><p>한 장 = 알고 싶은 것 하나 · 읽기 전에 적고, 읽은 뒤에 다시 펼쳐 내 말로 설명해요</p></div>
        <ul className={css.cards}>
          {!readOnly && <li><button type="button" className={css.newCard} data-guide={guideMark(guideCard)} disabled={busy} onClick={() => startCard()}><span aria-hidden="true">＋</span>새 설명 카드</button><GuideHint show={guideCard}>세린 · 여기를 눌러요</GuideHint></li>}
          {cards.map(card => { const progress = cardProgress(card); return <li key={card.id}>
            <button type="button" className={css.cardOpen} data-done={progress.done} disabled={busy} onClick={() => editCard(card)}>
              <small className={css.cardTab}>{card.book_title}</small><strong>{card.concept}</strong>
              <span className={css.dots} aria-label={`4단계 중 ${progress.done}단계`}>{[0, 1, 2, 3].map(i => <i key={i} data-done={i < progress.done} />)}</span><em>{progress.next}</em>
            </button>
            {!readOnly && (confirmDelete === card.id ? <span className={css.deleteRow}><button type="button" className={styles.textButton} disabled={busy} onClick={() => void onDeleteCard(card.id).then(() => setConfirmDelete(null))}>정말 지우기</button><button type="button" className={styles.textButton} disabled={busy} onClick={() => setConfirmDelete(null)}>그대로 두기</button></span> : <button type="button" className={css.removeCard} disabled={busy} aria-label={`${card.concept} 카드 지우기`} onClick={() => setConfirmDelete(card.id)}>지우기</button>)}
          </li>; })}
        </ul>
        {!cards.length && <p className={css.empty}>아직 카드가 없어요. 어려운 책일수록 한 번에 한 가지만 — 첫 장에서 생각 하나만 건져도 충분해요.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>}
    </section>}
  </GameModal>;
}
