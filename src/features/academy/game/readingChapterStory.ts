export const readingChapterTitle = '설명할 수 있을 때까지';
export const READING_CHAPTER_END = 17;
export interface ReadingBeat { speaker: 'ria' | 'serin'; text: string; thought?: boolean; art?: string; alt?: string; action?: 'field' | 'card'; label?: string }
// 삽화 3장 = codex CLI(OpenAI images/edits, gpt-image-2.5)로 생성 — `manifest-reading-chapter.json`.
const arrival = { art: 'chapter-reading-window', alt: '왕립 도서관 창가 자리에서 책을 읽는 세린을 발견한 리아' };
const shelves = { art: 'chapter-reading-shelves', alt: '도서관 추천 서가 앞에서 세린이 리아에게 책 한 권을 건네는 장면' };
const card = { art: 'chapter-reading-card', alt: '창가 탁자에서 설명 카드를 적는 리아와 곁에서 자기 카드를 적는 세린' };
/**
 * 제6장 — 기숙사의 세린이 **도서관**에도 있다. 주제는 추천 도서와 «학생처럼 읽지 않는» 읽기(파인만의 독서법).
 * 행동 단계 둘: 8 = `field`(추천 서가에서 읽어 볼 책 한 권 담기), 12 = `card`(첫 설명 카드). 완료 = 17.
 * 가르치되 요구하지 않는 선(제5장과 같다): 막힌 곳·다듬기는 가르치지만 이 장은 두 칸만 요구한다.
 */
export const readingChapterStory: ReadingBeat[] = [
  { speaker: 'ria', ...arrival, thought: true, text: '도서관에 왔는데… 창가 자리에 낯익은 뒷모습이 있다. 보라색 책갈피, 저건 세린 선배잖아? 기숙사가 아니라 여기서?' },
  { speaker: 'serin', text: '리아? 여기서 보니 반갑네요. 수요일 오후에는 늘 이 자리예요. 기숙사 책상보다 창이 넓고, 조용해서요. 앉으세요.' },
  { speaker: 'ria', text: '선배가 도서관에서 책 읽는 건 처음 봐요. 저는… 솔직히 책을 끝까지 읽어도 몇 주 지나면 남는 게 없어서, 요즘은 잘 안 펼치게 돼요.' },
  { speaker: 'serin', text: '저도 그랬어요. 밑줄은 잔뜩 긋는데 덮으면 사라지고. 그때 사서 엘리안이 한 말이 있어요 — «학생처럼 읽지 말고, 가르칠 사람처럼 읽어요.»' },
  { speaker: 'ria', text: '가르칠 사람처럼요? 저는 아직 배우는 쪽인데요.' },
  { speaker: 'serin', text: '파인만이라는 물리학자가 그랬대요. 어떤 생각을 어린 동생에게 설명할 수 있을 만큼 쉽게 풀지 못하면, 아직 이해한 게 아니라고. 그래서 읽는 동안 목표를 «끝내기»가 아니라 «설명하기»로 두는 거예요. 설명하려고 읽으면 읽히는 게 달라져요.' },
  { speaker: 'serin', text: '방법은 세 가지만 기억하면 돼요. 하나, 한 번에 생각 하나만 고른다. 둘, 책을 덮고 내 말로 설명해 본다. 셋, 설명하다 막힌 곳을 적고 그 자리만 다시 펼친다. 막힌 곳이 생기는 게 정상이에요 — 거기가 내가 아직 모르는 자리니까요.' },
  { speaker: 'ria', text: '그럼 책 한 권을 다 읽고 독후감을 쓰는 게 아니라… 한 가지씩이네요. 그 정도면 저도 해 볼 수 있을 것 같아요.' },
  { speaker: 'serin', ...shelves, text: '먼저 읽을거리부터 골라 봐요. 엘리안이 분야별로 꽂아 둔 추천 서가가 있어요. 오늘은 한 권만 «읽어 볼 책»으로 담아 두면 돼요. 읽는 건 천천히 — 담아 두는 것만으로도 시작이에요.', action: 'field', label: '세린의 추천 서가 펼치기' },
  { speaker: 'ria', text: '…제목만 봐도 어려워 보이는데요. 이런 책을 제가 설명할 수 있을까요?' },
  { speaker: 'serin', text: '어려운 책일수록 한 번에 한 가지만이에요. 읽기 전에 «이 책으로 알고 싶은 것 하나»를 먼저 정해 두는 거예요. 그걸 적는 카드가 있어요 — «설명 카드». 독후감이 아니라, 알고 싶은 것 하나를 정하고 읽은 뒤에 내 말로 설명해 보는 카드예요.' },
  { speaker: 'serin', text: '카드는 네 칸이지만 오늘 채우는 건 한 칸뿐이에요 — 이번 독서로 알고 싶은 것 한 줄. 설명은 읽은 «뒤»에 책을 덮고 적는 거라 지금은 비워 두세요. 막힌 곳과 다듬기도 그때 다시 펼쳐서 해요.' },
  { speaker: 'serin', text: '아까 담은 책이 아니어도 괜찮아요. 교과서의 한 단원, 요즘 읽던 글, 뭐든 좋아요. 그 책으로 알고 싶은 것 하나를 골라 첫 카드를 적어 봐요. 저는 옆에서 제 카드를 적고 있을게요.', action: 'card', label: '첫 설명 카드 적기' },
  { speaker: 'ria', ...card, thought: true, text: '알고 싶은 것을 먼저 적어 두니까… 책 전체가 아니라 그 자리를 찾아 읽으면 되겠다. 읽고 나서 책을 덮고 내 말로 설명해 보면, 어디가 비어 있는지도 보일 거야.' },
  { speaker: 'serin', text: '알고 싶은 것을 정했죠? 그게 오늘 가장 중요한 한 걸음이에요. 이제 책은 처음부터 끝까지가 아니라 그 답이 있는 자리를 찾아 읽어요. 읽고 나서 책을 덮고 내 말로 설명해 보면 막힌 곳이 보이고, 다음엔 거기서부터 다시 읽는 거예요.' },
  { speaker: 'serin', text: '카드가 쌓이면 리아만의 서가가 돼요. 한꺼번에 많이 쓰려고 하지 말아요. 일주일에 한 장이면 충분해요. 저도 수요일마다 한 장이에요 — 그래서 여기 있는 거고요.' },
  { speaker: 'ria', text: '선배, 다음 수요일에도 여기 계실 거죠? 그때는 읽고 와서 카드를 다시 펼쳐 설명해 드릴게요. 어린 동생한테 하듯이요.', label: '첫 설명 카드와 함께 제6장 마치기' },
  // 17 = 완료 장면의 글(책갈피는 17에서 끝난다 — 제5장과 같은 규칙: 마지막 beat 의 label 이 완료로 넘긴다).
  { speaker: 'ria', ...card, thought: true, text: '책을 «끝내는» 대신 «설명하는» 걸로 바꿨을 뿐인데, 읽는 자세가 달라졌다. 내가 아직 모르는 자리가 어디인지, 이제는 알 수 있다.' },
];
export function readingChapterText(step: number, bookTitle?: string | null) {
  if (step === 9 && bookTitle) return `「${bookTitle}」… 제목만 봐도 어려워 보이는데요. 이런 책을 제가 설명할 수 있을까요?`;
  return readingChapterStory[step]?.text ?? '첫 설명 카드를 남겼습니다. 설명할 수 있을 때까지, 한 번에 한 가지씩.';
}
export function readingChapterObjective(step: number) {
  if (step < 8) return '도서관에서 세린과 읽는 법 이야기 나누기';
  if (step === 8) return '추천 서가에서 읽어 볼 책 한 권 담기';
  if (step < 12) return '세린에게 설명 카드 배우기';
  if (step === 12) return '첫 설명 카드 적기 — 이번 독서로 알고 싶은 것 하나';
  return step < 17 ? '알고 싶은 것을 정한 마음 나누기' : '제6장 완료 · 첫 설명 카드를 남겼어요';
}
