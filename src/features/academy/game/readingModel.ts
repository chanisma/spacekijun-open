/**
 * 제6장 «설명할 수 있을 때까지» — 세린의 추천 서가와 **설명 카드** (2026-10-03).
 *
 * 영상 「학생처럼 읽지 마라: 책을 완벽히 흡수하는 파인만의 독서법」(파인만의 길)의 뼈대를 따른다:
 * 끝내려고 읽지 말고 **설명하려고** 읽는다 — ①생각 하나 고르기 ②책을 덮고 내 말로 설명 ③막힌 곳 찾기
 * ④더 쉽게 다듬기. 독후감이 아니다. **한 번에 한 가지**이고, 네 칸을 한 번에 다 채우라고 하지 않는다
 * (사용자 결정 — 부담이 크면 오히려 안 하게 된다). 설계는 «방법을 몸에 익히는 것»에 맞춘다.
 *
 * **카드를 꽂을 때 필수는 «알고 싶은 것» 하나뿐이다 (2026-10-03 사용자 정정)**: 설명은 책을 읽은 «뒤»에
 * 적는 다음 단계라, 알고 싶은 것을 적자마자 설명까지 요구하면 안 된다(종전엔 둘 다 없으면 저장이 막혀
 * 제6장을 넘길 수 없었다). 그래서 ①알고 싶은 것(읽기 전) → ②읽고 나서 내 말로 설명 → ③막힌 곳 → ④다듬기
 * 순이고, ②~④는 카드를 다시 펼쳐 채운다. 서버 CHECK 도 같은 규칙(explanation 0~1,000자).
 */
export const READING_FIELDS = [
  { key: '과학기술', label: '과학·기술', hint: '세상이 돌아가는 원리를 묻는 책' },
  { key: '동양사상', label: '동양 사상', hint: '오래된 질문을 오늘의 말로 다시 읽기' },
  { key: '서양사상', label: '서양 사상', hint: '사회·정치·마음을 설명하려 한 책' },
  { key: '외국문학', label: '외국 문학', hint: '다른 시대, 다른 땅의 사람 이야기' },
  { key: '한국문학', label: '한국 문학', hint: '우리말로 쓰인 삶과 역사' },
] as const;
export type ReadingField = typeof READING_FIELDS[number]['key'];
export const isReadingField = (v: unknown): v is ReadingField => READING_FIELDS.some(f => f.key === v);

/**
 * 학과별 추천 서가 (2026-10-03 사용자 요청 «과별로 읽으면 좋은 도서») — 계열 8개, 그 안에서 학과(출처)별로 묶는다.
 * 출처 둘: 고려대 도서관 «학과별 권장도서»(학과가 추천) · 서울대 아로리 «단과대학별 지원자가 가장 많이 읽은 책»(추천이 아니라 실제로 읽힌 책 — note 가 그렇게 말한다).
 * 시드 = `scripts/academy-reading-books/build-sql.py`.
 */
export const MAJOR_FIELDS = [
  { key: '인문', label: '인문', hint: '언어·역사·철학 — 사람이 남긴 생각을 읽는 학과' },
  { key: '사회', label: '사회', hint: '정치·사회·국제 — 사회가 어떻게 움직이는지 묻는 학과' },
  { key: '경영경제', label: '경영·경제', hint: '조직과 시장, 선택의 이유를 묻는 학과' },
  { key: '교육', label: '교육', hint: '가르치고 배우는 일을 묻는 학과' },
  { key: '자연', label: '자연', hint: '수학·화학·생명 — 자연의 원리를 묻는 학과' },
  { key: '공학', label: '공학', hint: '만들고 계산하는 학과 — 컴퓨터·화공·데이터' },
  { key: '의약보건', label: '의약·보건', hint: '몸과 돌봄을 다루는 학과 — 의대·간호·수의·약학' },
  { key: '예체능', label: '예술·디자인', hint: '디자인·미술·음악 학과' },
] as const;
export type BookShelf = 'classic' | 'major';
export interface BookRecommendation { id: string; shelf?: BookShelf; field: string; department?: string | null; title: string; author: string | null; note: string | null; source: string | null; sort: number }
export interface ReadingCard { id: string; user_id?: string; book_id: string | null; book_title: string; concept: string; explanation: string; stuck: string; simplified: string; created_at: string; updated_at: string }
export interface ReadingCardDraft { book_id?: string | null; book_title: string; concept: string; explanation: string; stuck?: string; simplified?: string }

export const CARD_LIMITS = { bookTitle: [1, 200], concept: [3, 200], explanation: [0, 1000], stuck: [0, 500], simplified: [0, 1000] } as const;

/** 저장 전 검사 — 서버 RPC 와 같은 규칙. 제목과 «알고 싶은 것»만 필수, 설명은 읽은 뒤에 채운다. */
export function validateReadingCard(draft: ReadingCardDraft): string | null {
  const len = (v: string | undefined) => (v ?? '').trim().length;
  if (len(draft.book_title) < CARD_LIMITS.bookTitle[0] || len(draft.book_title) > CARD_LIMITS.bookTitle[1]) return '어떤 책(또는 글)인지 제목을 적어 주세요.';
  if (len(draft.concept) < CARD_LIMITS.concept[0] || len(draft.concept) > CARD_LIMITS.concept[1]) return '이번 독서로 알고 싶은 것 하나를 3자 이상으로 적어 주세요.';
  if (len(draft.explanation) > CARD_LIMITS.explanation[1]) return '설명은 1,000자까지예요. 한 가지 생각만 담아 보세요.';
  if (len(draft.stuck) > CARD_LIMITS.stuck[1]) return '막힌 곳은 500자까지예요.';
  if (len(draft.simplified) > CARD_LIMITS.simplified[1]) return '다듬은 설명은 1,000자까지예요.';
  return null;
}

/** 카드가 네 단계 중 어디까지 왔나 — 화면의 작은 진행 점. */
export function cardProgress(card: Pick<ReadingCard, 'concept' | 'explanation' | 'stuck' | 'simplified'>): { done: number; total: 4; next: string } {
  const has = (v: string) => v.trim().length > 0;
  const done = (has(card.concept) ? 1 : 0) + (has(card.explanation) ? 1 : 0) + (has(card.stuck) ? 1 : 0) + (has(card.simplified) ? 1 : 0);
  const next = !has(card.concept) ? '이번 독서로 알고 싶은 것 하나 고르기' : !has(card.explanation) ? '읽고 나서 책을 덮고 내 말로 설명하기' : !has(card.stuck) ? '설명하다 막힌 곳 적기 — 다음에 거기부터 읽기' : !has(card.simplified) ? '막힌 곳을 다시 읽고 더 쉬운 말로 다듬기' : '이 생각은 설명할 수 있어요 ✦';
  return { done, total: 4, next };
}

/** 추천 서가 — 분야별로 묶고 정렬. 모르는 분야 값은 «기타»로 보낸다(시드가 바뀌어도 책이 사라지지 않게). `shelf` 가 없는 옛 행은 고전 서가다. */
export function groupBooksByField(books: BookRecommendation[], shelf: BookShelf = 'classic'): { key: string; label: string; hint: string; books: BookRecommendation[] }[] {
  const catalog = shelf === 'major' ? MAJOR_FIELDS : READING_FIELDS;
  const groups = catalog.map(f => ({ key: f.key as string, label: f.label, hint: f.hint, books: [] as BookRecommendation[] }));
  const other = { key: '기타', label: '그 밖의 책', hint: '', books: [] as BookRecommendation[] };
  for (const book of [...books].filter(b => (b.shelf ?? 'classic') === shelf).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'ko'))) {
    (groups.find(g => g.key === book.field) ?? other).books.push(book);
  }
  return other.books.length ? [...groups, other] : groups;
}

/** 한 계열 안의 학과(출처) 묶음 — 고려대 학과(학과가 추천)를 먼저, 서울대 단과대학(지원자가 읽은 책)을 뒤에. 묶음 안은 시드 순서. */
export function groupBooksByDepartment(books: BookRecommendation[]): { department: string; source: string | null; books: BookRecommendation[] }[] {
  const map = new Map<string, { department: string; source: string | null; books: BookRecommendation[] }>();
  for (const book of [...books].sort((a, b) => a.sort - b.sort)) {
    const key = book.department ?? '그 밖의 책';
    if (!map.has(key)) map.set(key, { department: key, source: book.source, books: [] });
    map.get(key)!.books.push(book);
  }
  const rank = (d: string) => (d.startsWith('고려대') ? 0 : d.startsWith('서울대') ? 1 : 2);
  return [...map.values()].sort((a, b) => rank(a.department) - rank(b.department) || a.department.localeCompare(b.department, 'ko'));
}

/**
 * 책등 모양 (2026-10-03 세린의 서가 개편 — 목록 대신 실제 책장). 같은 책은 언제나 같은 색·높이·두께여야
 * 다시 찾을 때 «그 빨간 책»으로 기억된다 → 무작위가 아니라 id 해시로 정한다.
 * 색은 가죽 장정 여섯 가지 — 책등 글자(크림)와의 대비가 모두 4.5:1 이상인 짙은 색만 쓴다.
 */
export const SPINE_TONES = ['#6e2430', '#23365e', '#2f5a45', '#5a2f5f', '#7a4a1c', '#1f5560'] as const;
export function spineOf(book: Pick<BookRecommendation, 'id' | 'title'>) {
  let h = 2166136261;
  for (const ch of book.id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const u = h >>> 0;
  const titleLength = [...book.title].length;
  return {
    tone: SPINE_TONES[u % SPINE_TONES.length],
    /** 높이 78~100% — 책장 칸 안에서 들쭉날쭉. */
    height: 78 + (u >>> 3) % 23,
    /** 두께 = 제목 길이에 따라(긴 제목이 너무 작은 글씨로 눌리지 않게) + 조금의 흔들림. */
    width: Math.min(52, Math.max(30, 26 + Math.ceil(titleLength / 9) * 8 + (u >>> 7) % 5)),
    band: (u >>> 11) % 3, // 금박 띠 모양 0~2
  };
}
