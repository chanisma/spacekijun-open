/**
 * 병 편지 — 바다를 떠도는 병 속 쪽지(2026-10-23 개편: 12통 → 36통, 종류 넷).
 *
 * 줍는 순서 = **무작위**(2026-10-23 사용자 요청). 병이 걸리면 서버(`tower_private.give_bottles`)가 아직 못 읽은 편지 중
 * 하나를 고른다(편지마다 같은 확률). 단, **«별지기의 편지»(이야기)는 고른 순간 «다음 이야기»로 바꿔 넣는다** — 이야기가
 * 마지막 병부터 읽히지 않게. 그래서 이야기 편지가 언제 오는지는 무작위이고, 이야기 안의 순서는 지켜진다.
 * 다 모은 뒤에 걸린 병은 «남는 병»(tower_state.bottle)이 되어 비공정 상인에게 코인으로 판다.
 *
 * ⚠️ key 와 순서는 SQL `tower_private.letter_keys()` 와 두 벌이다(회귀가 대조). 이미 받은 편지는 key 로 저장되므로
 * **key 를 바꾸거나 지우지 말 것** — 편지를 더할 때는 끝에 붙인다.
 */
export type LetterKind = 'story' | 'love' | 'prank' | 'far';

export interface Letter {
  key: string;
  kind: LetterKind;
  title: string;
  body: string;
}

export const LETTER_KINDS: { kind: LetterKind; label: string; blurb: string }[] = [
  { kind: 'story', label: '별지기의 편지', blurb: '세계가 어떻게 잠겼는지, 왜 탑을 쌓는지. 순서대로 이어져요.' },
  { kind: 'love', label: '러브레터', blurb: '부치지 못한 마음들이 바다를 건너왔어요.' },
  { kind: 'prank', label: '장난 편지', blurb: '바다에도 장난꾸러기는 있어요.' },
  { kind: 'far', label: '먼 곳의 편지', blurb: '어딘가에서 또 다른 탑을 쌓는 사람들.' },
];

export const LETTERS: Letter[] = [
  // ── 별지기의 편지(이야기 — 순서대로) ──
  { key: 'story-01', kind: 'story', title: '첫 번째 병', body: '이 병을 줍는 사람에게. 여기는 아직 물 위에 남은 몇 안 되는 지붕 중 하나예요. 오늘은 정어리 세 마리를 낚았어요. 그거면 충분한 하루였어요.' },
  { key: 'story-02', kind: 'story', title: '두 번째 병', body: '물은 하루에 손가락 한 마디씩 차올랐대요. 처음엔 아무도 몰랐고, 다들 알았을 땐 이미 계단이 잠겨 있었대요.' },
  { key: 'story-03', kind: 'story', title: '세 번째 병', body: '할머니는 물이 차오르기 전 밤하늘이 지금보다 훨씬 흐렸다고 했어요. 도시의 불빛이 별을 가렸대요. 이상하죠, 별이 더 잘 보이게 된 거예요.' },
  { key: 'story-04', kind: 'story', title: '네 번째 병', body: '나무 조각을 모아 층을 하나 올렸어요. 높이 올라갈수록 별이 조금 더 가까워지는 것 같아요. 기분 탓이겠죠?' },
  { key: 'story-05', kind: 'story', title: '다섯 번째 병', body: '무전기에서 누군가의 목소리를 들었어요. "거기도 별이 보이나요?" 대답했지만 다시는 들리지 않았어요.' },
  { key: 'story-06', kind: 'story', title: '여섯 번째 병', body: '서두르지 않기로 했어요. 낚싯대를 드리우고 기다리는 동안에도 탑은 자라고 있으니까요.' },
  { key: 'story-07', kind: 'story', title: '일곱 번째 병', body: '고래를 봤어요. 옛날 우리 학교가 있던 자리를 천천히 지나갔어요. 종소리 같은 노래를 불렀어요.' },
  { key: 'story-08', kind: 'story', title: '여덟 번째 병', body: '별자리마다 이름을 붙이고 있어요. 낚싯대, 작은 배, 등불… 잃어버린 것들의 이름을 하늘에 하나씩 옮겨 두는 거예요.' },
  { key: 'story-09', kind: 'story', title: '아홉 번째 병', body: '비 오는 날엔 찻방에서 물소리를 들어요. 아무것도 하지 않아도 괜찮은 날이 있다는 걸 이 바다가 가르쳐 줬어요.' },
  { key: 'story-10', kind: 'story', title: '열 번째 병', body: '어떤 날은 한 마리도 못 낚아요. 그래도 그날 본 노을은 남아요. 그걸로 하루를 셈해요.' },
  { key: 'story-11', kind: 'story', title: '열한 번째 병', body: '탑 꼭대기 돔에서 망원경을 닦았어요. 렌즈 너머 어딘가에 나처럼 탑을 쌓는 사람이 또 있을 거라고 믿어요.' },
  { key: 'story-12', kind: 'story', title: '마지막 병', body: '이 편지들을 끝까지 읽은 당신이라면 알 거예요. 탑을 쌓은 건 별에 닿으려는 게 아니었어요. 별을 보며 기다릴 수 있는 사람이 되려는 거였어요. — 별지기' },

  // ── 러브레터 ──
  { key: 'love-01', kind: 'love', title: '우산', body: '물이 처음 차오르던 날, 너는 말없이 내 쪽으로 우산을 기울여 줬지. 우산은 아무 소용이 없었는데, 그날부터 나는 비가 좋아졌어.' },
  { key: 'love-02', kind: 'love', title: '창가의 등불에게', body: '맞은편 지붕, 등불 켜는 창가의 너에게. 매일 밤 네 창의 불이 꺼지는 걸 보고서야 잠들어. 이름은 쓰지 않을게. 그러니까 내일도 불을 켜 줘.' },
  { key: 'love-03', kind: 'love', title: '여섯 번째 문장', body: '"좋아해"를 다섯 번 쓰고 다섯 번 지웠어. 여섯 번째는 지우기 전에 병에 넣어 버렸어. 이제 못 지우니까, 이건 진짜야.' },
  { key: 'love-04', kind: 'love', title: '오십 년', body: '여보, 오십 년 전 오늘 우리는 이 바다가 아직 운동장이던 곳에서 처음 만났지요. 당신은 공을 찼고 나는 그 공에 맞았어요. 아직도 조금 아파요. 사랑해요.' },
  { key: 'love-05', kind: 'love', title: '느린 우편', body: '부치지 못한 편지라서 병에 넣었어. 바다는 우체부보다 훨씬 느리지만 길을 잃지는 않는대. 언젠가 네 발치에 닿으면, 그때도 나를 기억해 줘.' },
  { key: 'love-06', kind: 'love', title: '별에게', body: '저 별빛은 아주 오래전에 출발한 빛이래. 그럼 내가 지금 보내는 마음도 아주 나중에야 너에게 닿겠지. 괜찮아, 나는 기다리는 걸 잘하니까.' },
  { key: 'love-07', kind: 'love', title: '답장', body: '네 병 받았어. 나도. — 짧아서 미안. 병이 너무 작았어.' },
  { key: 'love-08', kind: 'love', title: '혹시 이 병을 주운 사람이', body: '등대지기 소녀가 아니라면, 이 편지는 못 본 걸로 해 주세요. 정말로요. 그리고 혹시 그 애를 만나면, 고등어 구이 잘 굽는 애가 안부를 전한다고만 해 주세요.' },

  // ── 장난 편지 ──
  { key: 'prank-01', kind: 'prank', title: '행운의 편지', body: '이 편지는 영국에서 최초로 시작되어 일 년에 한 바퀴 바다를 돌면서 받는 사람에게 행운을 주었고, 지금은 당신에게로 옮겨진 이 편지는 4일 안에 당신 곁을 떠나야 합니다. 이 편지를 포함해서 7통을 행운이 필요한 사람에게 보내 주셔야 합니다. 추신: 바다에는 우체국이 없으니 빈 병 일곱 개부터 구하세요.' },
  { key: 'prank-02', kind: 'prank', title: '속았지?', body: '이 병에는 보물이 들어 있습니다! …라고 쓰면 열어 볼 줄 알았어요. 대신 이 쪽지를 드립니다. 오늘 당신 웃는 얼굴이 보물이에요. (조금 느끼했나요?)' },
  { key: 'prank-03', kind: 'prank', title: '보물 지도', body: '보물 지도. 등대에서 북쪽으로 열 걸음, 오른쪽으로 다섯 걸음 가서 파세요. 참고로 등대는 지금 물속 삼십 미터에 있습니다. 행운을 빌어요.' },
  { key: 'prank-04', kind: 'prank', title: '수수께끼', body: '젖을수록 마르는 것은? 정답은 수건. 문제는 우리 탑에 수건이 하나도 없다는 거예요. 그래서 오늘도 다 젖었어요.' },
  { key: 'prank-05', kind: 'prank', title: '거꾸로', body: '.요어었들힘 더 게 는쓰 로꾸거 실사 .요어했고수 라느읽 로꾸거 를지편 이' },
  { key: 'prank-06', kind: 'prank', title: '숨', body: '이 편지를 읽는 동안에도 당신은 숨을 쉬고 있었어요. 그런데 이제부터는 숨 쉬는 게 신경 쓰일 거예요. 미안해요. 조금 지나면 다시 잊어요.' },
  { key: 'prank-07', kind: 'prank', title: '답장 금지', body: '답장하지 마세요. 이 병은 일방통행입니다. 답장을 넣어 던져 봤자 바람이 도로 당신 이마에 가져다줍니다. 경험담이에요.' },
  { key: 'prank-08', kind: 'prank', title: '고양이가 씀', body: 'ㅁㄴㅇㄹㄹㄹㄹㅎㅎㅎ ㅋ ㅋ ㅋ ;;;;; 냥 — (주인 덧붙임: 제가 잠깐 자리를 비운 사이 고양이가 쓰고 병을 닫았습니다. 죄송합니다.)' },

  // ── 먼 곳의 편지 ──
  { key: 'far-01', kind: 'far', title: '남쪽 탑에서', body: '남쪽 바다의 탑에서 씁니다. 우리 탑은 지금 9층이에요. 당신 탑은 몇 층인가요? 이기려는 건 아니고, 그냥 궁금해서요. (조금은 이기고 싶어요.)' },
  { key: 'far-02', kind: 'far', title: '그림 한 장', body: '병 안에 그림이 한 장 들어 있다. 삐뚤빼뚤한 탑 하나, 그 위로 별 다섯 개, 맨 아래에 커다란 글씨로 "우리 집".' },
  { key: 'far-03', kind: 'far', title: '고등어 소금구이 비법', body: '비법을 알려 드릴게요. 소금은 바닷물을 말려서 만드세요. 이 세상에서 유일하게 넘쳐나는 재료니까요. 나머지는 기다리는 거예요. 고등어도, 사람도.' },
  { key: 'far-04', kind: 'far', title: '수학 숙제', body: '오늘 수학 숙제를 병에 넣어 띄워 버렸어요. 혹시 주운 분이 풀어서 돌려보내 주실 수 있나요? 3번 문제요. 선생님께는 비밀로 해 주세요.' },
  { key: 'far-05', kind: 'far', title: '여러 말로 된 인사', body: 'Hello. 안녕. Bonjour. Hola. こんにちは. 你好. 어느 바다에서 주우셨든, 한 줄은 읽으셨기를.' },
  { key: 'far-06', kind: 'far', title: '등대지기의 일지', body: '등대 불은 아직 켭니다. 지나가는 배가 한 척도 없어도요. 불을 켜는 이유가 배 때문만은 아니라는 걸 이제 알아요. 오늘 밤도 켭니다.' },
  { key: 'far-07', kind: 'far', title: '날씨 일기', body: '월요일 맑음. 화요일 비. 수요일 비. 목요일 갑자기 무지개. 금요일 다시 비. 기분은 대체로 목요일 같았어요.' },
  { key: 'far-08', kind: 'far', title: '백 번째 병', body: '이건 제가 바다에 띄운 백 번째 병이에요. 앞의 아흔아홉 개는 아무 답이 없었어요. 그래도 띄우는 이유요? 누군가 한 명은 읽을 테니까요. 지금 당신처럼요.' },
];

export const LETTER_BY_KEY: Record<string, Letter> = Object.fromEntries(LETTERS.map((l) => [l.key, l]));

/** 종류별로 몇 통 모았나 — 도감 머리·업적 진행 표시 */
export function letterKindCounts(found: string[]): Record<LetterKind, { have: number; total: number }> {
  const out = { story: { have: 0, total: 0 }, love: { have: 0, total: 0 }, prank: { have: 0, total: 0 }, far: { have: 0, total: 0 } };
  const set = new Set(found);
  for (const l of LETTERS) {
    out[l.kind].total++;
    if (set.has(l.key)) out[l.kind].have++;
  }
  return out;
}
