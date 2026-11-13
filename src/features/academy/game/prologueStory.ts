export const prologueTitle = '아직 이름 없는 별';
export type PrologueScene = 'school' | 'door' | 'threshold' | 'arrival' | 'tour' | 'notebook';
export interface PrologueBeat { scene: PrologueScene; speaker: '이야기' | '리아' | '루온'; text: string }
export const prologueScenes = {
  school: { title: '01 · 비어 있는 한 칸', image: 'prologue-school.png' },
  door: { title: '02 · 어제는 없던 문', image: 'prologue-door.png' },
  threshold: { title: '02 · 문 너머의 첫걸음', image: 'prologue-threshold.png' },
  arrival: { title: '03 · 당신을 기다리는 사람', image: 'prologue-arrival.png' },
  tour: { title: '03 · 질문이 별이 되는 곳', image: 'plaza.png' },
  notebook: { title: '03 · 아직 이름 없는 별', image: 'prologue-notebook.png' },
} as const;
export const prologueStory: PrologueBeat[] = [
  { scene: 'school', speaker: '이야기', text: '방과 후의 교실. 창문에 남은 빗방울이 저녁 햇살을 잘게 나누고 있었다. 리아의 책상에는 진로 희망 조사서 한 장이 놓여 있었다. 이름도, 반도 적었지만 마지막 한 칸은 비어 있었다.' },
  { scene: 'school', speaker: '리아', text: '“앞으로 하고 싶은 일.”\n누군가는 망설이지 않고 쓰던데. 나는 왜 이 질문 앞에만 오면 연필이 멈출까.' },
  { scene: 'school', speaker: '이야기', text: '아무것도 해보지 않은 건 아니었다. 친구와 준비한 발표도, 실험 결과가 예상과 달라 밤늦게 찾아본 자료도 있었다. 그런데 그 순간들을 “내 꿈”이라는 말로 묶으려니 자꾸 자신이 없어졌다.' },
  { scene: 'school', speaker: '리아', text: '흥미로웠던 순간은 분명 있었는데…….\n내가 좋아하는 건 뭘까. 잘하고 싶은 건 또 뭘까. 아직 모른다고 말해도 괜찮을까?' },
  { scene: 'school', speaker: '이야기', text: '리아는 빈칸을 그대로 둔 채 종이를 접었다. 도서관에 돌려줄 책을 안고 복도로 나서자, 운동장의 웃음소리도 멀어졌다. 오늘따라 익숙한 학교가 조금 낯설게 느껴졌다.' },
  { scene: 'door', speaker: '이야기', text: '도서관으로 가는 계단 옆, 늘 게시판이 있던 자리에 문 하나가 서 있었다. 낡은 금빛 테두리와 별 모양의 손잡이. 매일 지나던 곳인데, 리아는 그런 문을 본 적이 없었다.' },
  { scene: 'door', speaker: '리아', text: '이런 교실이 있었나?\n안에서…… 종소리가 들리는 것 같아.' },
  { scene: 'door', speaker: '이야기', text: '문 아래로 새어 나오는 빛 속에서 작은 글귀가 떠올랐다.\n“아직 답을 찾지 못한 이에게.”\n리아는 주머니 속 조사서를 만졌다. 마치 그 비어 있는 한 칸을 누군가 알아본 것 같았다.' },
  { scene: 'door', speaker: '리아', text: '잠깐만 들여다보는 거야.\n무엇이 있는지…… 그것만 알아보자.' },
  { scene: 'door', speaker: '이야기', text: '손잡이는 햇볕을 머금은 듯 따뜻했다. 문을 밀자 종이와 비 냄새 대신 장미 향을 실은 바람이 밀려왔다. 문 너머에는 교실도, 복도도 없었다. 보랏빛 하늘 아래 처음 보는 탑들이 서 있었다.' },
  { scene: 'threshold', speaker: '이야기', text: '한 걸음. 구두 밑으로 단단한 돌바닥의 감촉이 전해졌다. 교복 소매 끝에서 빛이 풀리더니, 별무늬가 수놓인 보랏빛 옷자락이 바람에 흔들렸다. 품에 안았던 책은 작고 빈 수첩으로 바뀌어 있었다.' },
  { scene: 'arrival', speaker: '리아', text: '여긴…… 어디야? 옷은 또 왜 이래?\n분명 학교에 있었는데. 나, 꿈을 꾸고 있는 건가?' },
  { scene: 'arrival', speaker: '이야기', text: '리아가 문과 광장을 번갈아 바라보는 동안, 아카데미 정문 앞에 서 있던 청년이 그녀를 발견했다. 그는 서두르지 않고 다가와, 리아가 놀라지 않을 만큼의 거리를 남기고 멈췄다.' },
  { scene: 'arrival', speaker: '루온', text: '여기 계셨네요.\n기다리고 있었어요. 처음 오는 길이라 많이 놀라셨죠?' },
  { scene: 'arrival', speaker: '리아', text: '저를…… 기다렸다고요?\n저를 아세요? 저는 이곳에 올 생각도 없었는데요.' },
  { scene: 'arrival', speaker: '루온', text: '어떤 분이 오실지는 몰랐어요. 다만 문에 불이 켜졌거든요. 처음 온 여행자가 혼자 길을 헤매지 않도록 맞이하는 게 제 일이랍니다. 저는 루온이에요.' },
  { scene: 'arrival', speaker: '리아', text: '리아…… 저는 리아예요.\n아까 문에 “아직 답을 찾지 못한 이에게”라고 쓰여 있었어요.' },
  { scene: 'arrival', speaker: '루온', text: '그 문은 마음에 질문을 품은 사람 앞에 나타나요. 어서 오세요, 리아. 이곳은 별빛 아카데미. 자신에 대해, 그리고 세상에 대해 알아가는 곳이에요.' },
  { scene: 'arrival', speaker: '리아', text: '하지만 저는 하고 싶은 일도 아직 못 정했어요.\n다들 앞으로 갈 곳을 아는 것 같은데, 저만…… 무엇부터 찾아야 할지도 모르겠어요.' },
  { scene: 'arrival', speaker: '루온', text: '그렇다면 천천히 둘러보면 되겠네요.\n이곳에 들어오려고 완성된 꿈을 가져올 필요는 없어요. 지금 품고 있는 질문이면 충분해요.' },
  { scene: 'tour', speaker: '이야기', text: '루온의 목소리에는 재촉하는 기색이 없었다. 리아는 품에 꼭 안고 있던 수첩에서 조금 힘을 뺐다. “아직 모르겠다”는 말을 하고도, 대화를 계속할 수 있다는 게 이상하게 다행스러웠다.' },
  { scene: 'tour', speaker: '루온', text: '저쪽 왕립 도서관에는 누군가 직접 해보고 남긴 이야기들이 있어요. 읽다가 마음이 머무는 장을 찾아보세요. “나는 다르게 해보고 싶다”는 생각도 좋은 시작이죠.' },
  { scene: 'tour', speaker: '루온', text: '별의 연구시설에서는 그 질문을 탐구로 이어갈 수 있어요. 카시안 교수님이 길을 함께 살펴주실 거예요. 전서구 우편국에는 먼 세상의 소식도 도착하고요. 리아의 관심이 어디로 향하는지, 차근차근 알아가면 돼요.' },
  { scene: 'tour', speaker: '리아', text: '하다가 마음이 바뀌어도 괜찮아요?\n좋아할 줄 알았는데, 다른 게 더 궁금해질 수도 있잖아요.' },
  { scene: 'tour', speaker: '루온', text: '물론이죠. 직접 해보며 생각이 달라진 것도 리아가 알아낸 것이니까요. 이곳의 별자리는 그렇게 조금씩 모습을 바꿔요. 어떤 별을 이어볼지는 리아가 정하는 거예요.' },
  { scene: 'tour', speaker: '리아', text: '그럼…… 원래 있던 곳으로도 돌아갈 수 있나요?\n아직 그 조사서도 다 못 썼는데.' },
  { scene: 'notebook', speaker: '루온', text: '돌아갈 길은 열려 있어요. 원할 때 쉬어도 되고요. 이곳에서 발견한 생각들은 리아의 일상에서도 이어질 거예요. 그 빈칸도, 언젠가는 리아의 말로 채울 수 있겠죠.' },
  { scene: 'notebook', speaker: '이야기', text: '리아가 수첩을 펼치자 첫 장 귀퉁이에 작은 별이 반짝였다. 아직 선으로 이어지지 않은 별. 이상하게도, 비어 있는 페이지가 아까처럼 무섭지는 않았다.' },
  { scene: 'notebook', speaker: '루온', text: '함께 가요, 리아. 입구에서 기다리고 있었어요.\n먼저 별의 연구시설을 보여 드릴게요. 카시안 교수님과 리아의 하늘을 살펴봐요. 첫길은 제가 곁에서 안내할게요.' },
  { scene: 'notebook', speaker: '리아', text: '……좋아요.\n오늘은 제가 무엇을 궁금해하는지, 하나만 알아보고 싶어요.' },
  { scene: 'notebook', speaker: '이야기', text: '리아는 수첩의 첫 줄에 적었다.\n“아직 모르지만, 알아보고 싶다.”\n루온과 나란히 정문을 지나자, 머리 위에서 아직 이름 없는 별 하나가 조용히 빛났다.' },
];

export interface PrologueProgress { user_id: string; scene_index: number; completed_at: string | null; skipped: boolean; updated_at: string }
export function needsPrologue(progress: PrologueProgress | null | undefined, hasQuest: boolean) {
  return !progress?.completed_at && (!!progress || !hasQuest);
}
export function resumePrologueIndex(index: number | undefined) {
  return Math.min(prologueStory.length - 1, Math.max(0, Number.isInteger(index) ? index! : 0));
}
