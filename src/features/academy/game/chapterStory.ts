export type ChapterSpeaker = 'ria' | 'luon' | 'professor';
export interface ChapterBeat { speaker: ChapterSpeaker; text: string; thought?: boolean; emptyText?: string; reply?: string; action?: 'arrive' | 'telescope' | 'desk' | 'design'; label?: string }
export const chapterTitle = '나의 첫 별';
export const chapterStory: ChapterBeat[] = [
  { speaker: 'luon', text: '리아, 먼저 보여 주고 싶은 곳이 있어요. 꿈이 정해진 사람만 들어갈 수 있는 곳은 아니니까, 문 앞에서 망설이지 않기로 해요.' },
  { speaker: 'ria', text: '아직 내가 뭘 좋아하는지도 잘 모르겠는데… 그래도 괜찮다면 가 보고 싶어요. 이번에는 문 안쪽에 뭐가 있는지, 제 눈으로 볼래요.' },
  { speaker: 'luon', text: '별의 연구시설이에요. 카시안 교수님께 리아를 소개할게요. 천천히 와요. 첫 구경을 서두르기엔 아까운 곳이거든요.', action: 'arrive', label: '루온과 연구시설에 들어가기' },
  { speaker: 'ria', text: '와… 천장 안에 밤하늘이 있어요! 저 커다란 망원경으로 정말 별을 보는 거예요? 이런 곳이 있을 줄은 몰랐어요.', reply: '문을 열기 전에는 상상하기 어렵죠. 리아가 어떤 표정을 지을지, 저도 조금 궁금했어요.' },
  { speaker: 'professor', text: '어서 오렴, 리아. 나는 이곳을 맡고 있는 카시안이란다. 루온에게 오는 길 이야기는 들었어. 오늘은 정답을 아는지 묻지 않을 테니, 편히 둘러보렴.' },
  { speaker: 'professor', text: '망원경 너머에는 네가 배우고 관심을 두었던 것들이 별로 나타난단다. 별을 누르면 어떤 기록인지 볼 수 있어. 별 사이의 선도 살펴보렴. 서로 다른 경험이 이어져 있을 테니까.' },
  { speaker: 'professor', text: '자, 망원경 앞에 서 보렴. 처음이니 내가 별 하나를 골라 두었단다. 하늘에서 그 별을 찾아 눌러 보자 — 누르면 그 별에 담긴 네 기록이 펼쳐질 거야. 읽어 본 뒤 어떤 기분인지 들려주겠니?', action: 'telescope', label: '망원경으로 나의 별자리 바라보기' },
  { speaker: 'ria', thought: true, text: '이게… 전부 나와 이어진 별들이었구나. 그냥 지나쳤던 관심과 활동이 이렇게 남아 있다니! 나한테도 보여 줄 수 있는 하늘이 있었어.', emptyText: '아직은 조용한 하늘이네. 그래도 여기에 내 별이 생길 수 있다는 거잖아. 처음엔 아무것도 없다고 생각했는데… 이제 어떤 별을 놓을지 궁금해졌어.' },
  { speaker: 'professor', text: '그래. 네가 걸어온 길에도 살펴볼 이야기가 있단다. 그리고 이 하늘은 완성된 그림이 아니야. 새로운 질문을 품으면, 다음에 찾아볼 별의 자리를 정할 수 있지.', emptyText: '지금 기록된 별이 없다고, 네게 호기심까지 없는 건 아니란다. 무엇이 궁금한지부터 말해 보렴. 그 질문이 첫 관측의 출발점이 될 수 있어.' },
  { speaker: 'ria', text: '교수님, 저도 새로운 별을 찾아보고 싶어요. 누군가 정해 준 답을 고르는 게 아니라, 제가 궁금한 걸 직접 알아보고 싶어졌어요.' },
  { speaker: 'professor', text: '그럼 연구대로 가 보자. 별자리 지도 위의 빈 종이가 설계지란다. 설계지는 위에서 아래로 한 칸씩 채우면 돼 — 어느 수업에서 찾을지, 어느 별에서 출발할지, 무엇이 궁금한지. 내가 옆에서 한 칸씩 안내하마. 보라색 수첩에는 확정한 설계가 보관된단다.', action: 'desk', label: '교수와 연구대 살펴보기' },
  { speaker: 'professor', text: '이 장에서 할 일은 탐구 하나를 설계하는 거야. 아까 망원경에서 본 별이 설계지에 재료로 들어와 있을 거다. 그 별을 보며 궁금한 것을 적고, 설계도를 만들어 읽은 뒤, 이 탐구를 고른 네 이유를 적어 확정하자. 설계지의 안내를 따라 한 칸씩 가면 된단다. 서두르지 않아도 돼.', action: 'design', label: '연구대의 설계지로 돌아가기' },
  { speaker: 'professor', text: '잘 보았다, 리아. 네 질문에 방법과 이유가 생겼구나. 아직 발견하지 않은 별이라도, 어디를 바라볼지는 네 손으로 정한 거야. 네 첫 탐구 설계를 수첩에 보관해 두마.' },
  { speaker: 'ria', text: '처음에는 저 망원경 앞에 서는 것도 겁났는데… 이제 제가 찾아보고 싶은 별이 생겼어요. 이 설계대로 해 보면 어떤 걸 알게 될지 기대돼요.' },
  { speaker: 'luon', text: '리아가 직접 이름 붙인 첫 별이네요. 문 앞에서 같이 들어오길 잘했어요. 다음엔 어떤 이야기를 들려줄지, 벌써 궁금한데요.' },
  { speaker: 'professor', text: '연구시설에는 자주 오렴. 탐구가 잘 풀리는 날에도, 생각이 막히는 날에도. 네 별자리 이야기도 좋고, 활동을 하며 생긴 고민도 좋아. 앞으로 여러 이야기를 나누자꾸나.' },
];
export function chapterObjective(step: number) {
  if (step < 3) return '루온과 별의 연구시설로 가기';
  if (step < 7) return '카시안을 만나 망원경으로 내 별 살펴보기';
  if (step < 10) return '나의 별을 발견한 마음 나누기';
  if (step < 12) return '연구대에서 내 이유와 함께 탐구 하나 확정하기';
  return step < 16 ? '카시안과 루온에게 첫 설계 보여 주기' : '제1장 완료 · 나의 첫 탐구 설계';
}
