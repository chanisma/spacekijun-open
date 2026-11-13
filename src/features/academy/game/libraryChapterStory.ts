export const libraryChapterTitle = '이야기 속에서 자라는 질문';
export interface LibraryBeat { speaker: 'ria' | 'luon' | 'librarian'; text: string; thought?: boolean; label?: string; action?: 'arrive' | 'book' | 'note'; art?: string; alt?: string }
export const libraryChapterStory: LibraryBeat[] = [
  { speaker: 'luon', text: '리아, 잠깐만요. 아까 교수님 앞에서 설계도를 펼칠 때, 표정이 달라진 거 알아요? 잘 해낼 줄 알았어요. 정말로요.' },
  { speaker: 'ria', text: '아직도 조금 얼떨떨해요. 제가 탐구를 설계했다니…. 다음에도 할 수 있을까 싶기도 하고요.' },
  { speaker: 'luon', text: '처음엔 망원경 앞에 서는 것도 어색하죠. 그래도 한 번 더 들여다보면, 전에는 못 보던 게 눈에 들어와요. 리아가 찾아갈 우주는 지금보다 훨씬 아름다울 거예요.' },
  { speaker: 'luon', text: '저도 처음엔 한참 헤맸어요. 남들 별은 다 반짝이는데 제 하늘만 빈 것 같았거든요. 근사한 질문을 해야 한다고 생각하니까, 오히려 아무것도 떠오르지 않더라고요.' },
  { speaker: 'ria', text: '루온도 그랬어요? 늘 길을 잘 알고 있는 것 같았는데…. 어떻게 조금씩 달라졌어요?' },
  { speaker: 'luon', text: '다른 사람이 남긴 기록에서 시작했어요. 그 사람은 왜 이런 걸 해 봤을까, 나라면 어떻게 했을까. 그런 생각을 몇 줄 적다 보니 제 질문이 되더라고요. 지금은 훨씬 수월해졌죠. 저한테 도움이 됐던 곳이 있어요. 같이 가 볼래요?', action: 'arrive', label: '루온과 왕립 도서관으로 가기' },
  { speaker: 'ria', thought: true, text: '여기가… 왕립 도서관? 창문마다 별빛이 비치는 것 같아. 저 안에는 어떤 이야기들이 기다리고 있을까?', art: 'chapter-library-arrival', alt: '왕립 도서관의 웅장한 전경을 함께 바라보는 리아와 루온', label: '왕립 도서관의 문 열기' },
  { speaker: 'librarian', text: '어서 오세요. 루온, 오늘은 혼자가 아니군요. 저는 이 도서관의 기록을 돌보는 엘리안입니다. 리아라고 불러도 될까요?' },
  { speaker: 'luon', text: '벌써 이름까지 아시네요. 오늘은 책 반납이 조금 늦었다는 이야기를 들으러 온 건 아니에요.' },
  { speaker: 'librarian', text: '그렇다면 다행이군요. 빌려 간 책 사이에 꽂아 둔 메모가 책보다 두꺼워져서 돌아오곤 했으니까요. 오늘은 어떤 이야기를 찾으러 왔나요?' },
  { speaker: 'luon', text: '리아가 방금 첫 탐구를 설계했어요. 다음 별은 어디서 찾아야 할지 궁금해하길래요. 저한테 길을 열어 줬던 이 책장들을 보여 주고 싶었어요.' },
  { speaker: 'librarian', text: '첫 설계를 마쳤다니, 축하합니다. 이곳에는 앞서 궁금해하고, 시도하고, 발견한 사람들의 활동이 남아 있어요. 정답을 찾으려 애쓰지 않아도 됩니다. 우선 눈길이 가는 책장부터 살펴보세요.' },
  { speaker: 'ria', thought: true, text: '책이 이렇게나 많아…! 이게 전부 누군가가 직접 해 보고 남긴 이야기라고? 나랑 비슷한 걸 궁금해했던 사람도 있을까?', art: 'chapter-library-shelves', alt: '수없이 많은 도서관 책에 놀라 손을 뻗는 리아와 곁에서 안내하는 루온', action: 'book', label: '책장에서 책 꺼내기' },
  { speaker: 'librarian', text: '책을 펼치면 목차에 활동의 이름들이 보일 거예요. 관심이 가는 이름을 하나 고르고, 어떤 일을 했는지 천천히 읽어 보세요. 마음에 남는 활동을 찾으면 수첩으로 가져오면 됩니다.', action: 'book', label: '관심 있는 활동 찾아 읽기' },
  { speaker: 'librarian', text: '어떤 점에서 발걸음이 멈췄나요? 그 활동에서 떠오른 질문 하나와, 왜 그 점이 궁금해졌는지를 수첩에 남겨 보세요. 아직 답을 몰라도 괜찮습니다. 그 이유가 리아만의 출발점이니까요.', action: 'note', label: '질문과 궁금해진 이유를 수첩에 적기' },
  { speaker: 'ria', thought: true, text: '누군가 해 본 일이 책으로 남고, 그걸 읽은 내 질문이 다시 생기는 거구나. 그냥 오래된 기록인 줄 알았는데… 지금 내 이야기랑 이어지고 있어.' },
  { speaker: 'ria', text: '저도 언젠가 여기에 제 이야기를 남겨 보고 싶어요. 잘한 결과만 아니라, 해 보면서 막혔던 일이나 새로 궁금해진 것도요.' },
  { speaker: 'librarian', text: '좋은 생각이에요. 언제든 이곳의 기록들을 참고하세요. 새로운 이야기를 제안하고 싶을 때도 저를 찾아오고요. 리아의 기록을 기다리는 누군가가, 언젠가 이 책장 앞에 서게 될 테니까요.', label: '나의 질문과 함께 제2장 마치기' },
];
export function libraryChapterObjective(step: number) {
  if (step < 6) return '광장에서 루온의 이야기를 듣고 도서관으로 가기';
  if (step < 12) return '엘리안과 인사하고 왕립 도서관 살펴보기';
  if (step < 14) return '책의 목차에서 관심 있는 활동을 골라 읽기';
  if (step === 14) return '수첩에 질문과 궁금해진 이유 남기기';
  return step < 18 ? '엘리안과 나의 다음 이야기 나누기' : '제2장 완료 · 나만의 질문을 수첩에 남겼어요';
}
