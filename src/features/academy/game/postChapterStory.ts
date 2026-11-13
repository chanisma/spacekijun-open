export const postChapterTitle = '아침의 편지, 새로운 가능성';
export const POST_CHAPTER_END = 30;
export interface PostBeat {
  speaker: 'ria' | 'luon' | 'postmaster'; text: string; thought?: boolean;
  art?: string; alt?: string; action?: 'arrive' | 'letters' | 'note'; label?: string;
}
const morning = { art: 'chapter-post-morning', alt: '아침 햇살이 비치는 중앙 광장에서 이야기를 나누는 리아와 루온' };
const arrival = { art: 'chapter-post-arrival', alt: '편지를 든 채 날아드는 전서구에 놀라는 리아와 곁에서 웃는 루온' };
const letter = { art: 'chapter-post-letter', alt: '루온 곁에서 노엘이 건네는 편지를 받아 드는 리아' };
const complete = { art: 'chapter-post-complete', alt: '작성한 관측 일지를 들고 웃는 리아를 따뜻하게 바라보는 루온과 노엘' };
export const postChapterStory: PostBeat[] = [
  { speaker: 'luon', ...morning, text: '리아, 좋은 아침이에요. 여기서 만나니 반갑네요. 낯선 방이었을 텐데… 잠은 잘 잤어요?' },
  { speaker: 'ria', ...morning, text: '네, 생각보다 푹 잤어요. 어젯밤에는 세린 선배를 만났어요. 홀에서 길을 못 찾고 있었는데 먼저 말을 걸어 주셨어요.' },
  { speaker: 'luon', text: '세린 선배와 같은 방이군요. 다행이에요. 선배와는 무슨 이야기를 했어요?' },
  { speaker: 'ria', text: '사서가 되고 싶어서 읽은 책을 조금씩 기록하신대요. 제 이야기도 끝까지 들어 주시고, 플래너를 함께 봐 주셨어요.' },
  { speaker: 'luon', text: '선배답네요. 도서관에서 가끔 뵈는데, 책 이야기를 하실 때면 눈이 반짝이거든요. 리아도 편하게 지낼 수 있을 것 같아요.' },
  { speaker: 'ria', text: '저도 그런 생각이 들었어요. 아직은 모르는 게 많지만, 방으로 돌아가면 이야기할 사람이 있다는 게 좋아요.' },
  { speaker: 'luon', text: '그 말을 들으니 저도 마음이 놓여요. 저는 지금 전서구 우편국에 들르려던 참인데, 아침 산책 삼아 같이 가 볼래요?' },
  { speaker: 'ria', text: '좋아요. 어제 광장에서 비둘기들이 날아가는 걸 봤는데, 그쪽으로 가는 거였나 봐요. 루온에게 온 편지가 있어요?' },
  { speaker: 'luon', text: '저한테만 온 편지는 아니에요. 여러 곳에서 들려오는 새로운 소식을 모아 두거든요. 아침에 들르면 세상이 조금씩 달라지고 있다는 게 느껴져요.' },
  { speaker: 'ria', text: '어제 도서관에서는 오래 남겨진 기록에서도 배울 게 많다는 생각을 했어요. 우편국에서는 또 다른 이야기를 만나겠네요.' },
  { speaker: 'luon', text: '맞아요. 도서관에서 읽은 이야기가 새 소식을 이해하는 데 도움이 되기도 해요. 반대로 오늘 도착한 소식 때문에 예전 기록을 다시 찾아보게 될 때도 있고요.' },
  { speaker: 'ria', text: '그러면 제가 어제 떠올린 질문도 달라질 수 있겠어요. 오늘은 어떤 소식이 왔을지 궁금해요.' },
  { speaker: 'luon', text: '저도요. 저 창문으로 전서구들이 모여드는 게 보이죠? 노엘이 분주할 시간이에요. 같이 들어가 봐요.', action: 'arrive', label: '루온과 전서구 우편국으로 가기' },
  { speaker: 'ria', ...arrival, text: '와… 편지를 이렇게 많이 들고 날아오는구나. 방금 내려놓은 편지도 아직 따뜻한 아침 공기를 품고 있는 것 같아.', thought: true },
  { speaker: 'ria', text: '루온, 저 비둘기는 제 손에 편지를 놓고 갔어요! 모두 어디에서 날아온 걸까요?' },
  { speaker: 'luon', text: '저마다 먼 곳을 다녀왔겠죠. 리아가 마음에 들었나 봐요. 노엘, 좋은 아침이야. 오늘도 배달이 한창이네.' },
  { speaker: 'postmaster', text: '루온! 마침 잘 왔어. 오늘도 놀라운 소식이 쏟아져서 정신이 없어. 이 묶음부터 정리하고… 어, 옆에 처음 보는 얼굴이 있네?' },
  { speaker: 'luon', text: '어제 아카데미에 온 리아야. 첫 별도 찾고, 도서관에서 자기 질문도 남겼어. 오늘은 여기 소식을 함께 보고 싶어서 데려왔어.' },
  { speaker: 'postmaster', text: '반가워, 리아! 난 노엘이야. 멀리서 온 이야기가 길을 잃지 않게 정리하고 있지. 손에 든 편지도 고마워. 벌써 전서구한테 인사받았구나?' },
  { speaker: 'ria', text: '네, 갑자기 내려앉아서 조금 놀랐어요. 반가워요, 노엘. 오늘 들어온 소식 중에는 어떤 이야기가 있어요?' },
  { speaker: 'postmaster', ...letter, text: '이 편지부터 한번 볼래? 네 컷 이야기가 동봉된 편지 중 가장 최근에 도착한 거야. 그림부터 천천히 보고, 기사에서 어떤 일이 있었는지도 읽어 봐.', action: 'letters', label: '노엘이 건넨 최신 편지 읽기' },
  { speaker: 'postmaster', text: '어떤 대목에서 눈길이 멈췄어? 바로 답을 찾지 않아도 돼. 읽으면서 궁금해진 걸 네 말로 한 줄 남겨 보면 어때?' },
  { speaker: 'postmaster', text: '질문은 직접 떠올려 보는 게 가장 좋아. 막막하면 기사 아래 질문 예시를 보고, 네가 궁금한 방향으로 바꿔도 괜찮아. 왜 그럴지, 어떻게 확인할지도 생각나는 만큼 관측 일지에 적어 봐.', action: 'note', label: '읽은 편지에 나의 관측 일지 남기기' },
  { speaker: 'ria', ...complete, text: '다 적었어요. 처음에는 신기한 소식이라고만 생각했는데, 쓰다 보니까 제가 더 알아보고 싶은 부분이 보여요.' },
  { speaker: 'luon', ...complete, text: '리아만의 질문이 생겼네요. 아침에 여기 오길 잘했죠? 저도 리아가 어떤 걸 발견했는지 더 듣고 싶어요.' },
  { speaker: 'postmaster', text: '잘 읽었네, 리아. 같은 편지에서도 사람마다 다른 질문을 찾거든. 네 일지는 여기 잘 보관해 둘게. 나중에 생각이 달라지면 다시 펼쳐 봐도 좋아.' },
  { speaker: 'ria', text: '고마워요. 다음 소식을 읽으면 오늘 적은 질문에 힌트가 있을지도 모르겠어요. 다시 와도 괜찮아요?' },
  { speaker: 'postmaster', text: '물론이지! 새로운 소식이 궁금해지면 언제든 와. 편지를 같이 읽으면서 이야기해도 좋고, 네가 발견한 걸 들려줘도 좋아.' },
  { speaker: 'postmaster', text: '더 알아보고 싶은 질문은 연구시설로 가져가도 돼. 기사 요약도 함께 챙겨 줄 테니, 카시안 교수님과 이어서 탐구를 설계해 봐. 이 편지가 새 별의 시작이 될 수도 있잖아.' },
  { speaker: 'ria', ...complete, text: '어제의 기록과 오늘의 소식, 그리고 내가 남긴 질문. 서로 멀리 떨어져 있던 것들이 조금씩 이어지는 기분이야. 다음에는 어떤 편지가 도착할까?', thought: true, label: '새로운 가능성과 함께 제4장 마치기' },
];
export function postChapterObjective(step: number) {
  return step < 13 ? '아침 광장에서 루온과 이야기하고 우편국으로 향하기'
    : step < 21 ? '노엘과 인사하고 네 컷 이야기가 담긴 최신 편지 읽기'
    : step < 23 ? '읽은 기사에 나의 질문을 담은 관측 일지 남기기'
    : step < POST_CHAPTER_END ? '루온과 노엘에게 발견한 질문 들려주기' : '편지에서 새로운 가능성을 발견했습니다.';
}
