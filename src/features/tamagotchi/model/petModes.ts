/**
 * 다마고찌 모드(2026-10-19 사용자 요청 «이지·노멀·하드. 노멀은 죽음이 있고, 하드는 개복치 모드 — 다양한 이유로
 * 죽을 수 있다. 좀 유머러스하게»). 순수 표 — 생명 모델·화면·앨범·회귀가 같이 읽는다(petModel 을 import 하지 않는다).
 *
 * - 이지 = 죽지 않는다(2026-10-06 처음 결정 그대로 · 기본값 · 저장값에 `mode` 키가 없다)
 * - 노멀 = 아픈 채로 «깨어 있는» 24시간 위독 · 48시간 별(앞서 만든 «죽음 옵션»)
 * - 하드 = 개복치. **같은 날 다시 설계**(사용자: «죽을 수 있는 조건을 제시하는 게 아니라 정말 의외의 이유로 죽을 수 있음.
 *   끔찍하기보다 유머러스하게 — 산책하다 나무에서 떨어진 다람쥐를 맞고 같은 느낌으로, 다양한 이벤트에서 랜덤하게»).
 *   그래서 규칙 글은 조건을 늘어놓지 않는다. 밥·간식·산책·놀이·쓰다듬기·씻기·주사·불·잠들기·깨기·똥·진화·가만히 있기 —
 *   일마다 작은 확률이 있고, 걸리면 그 일에 맞는 웃긴 이유 하나가 뽑힌다(`HARD_EVENTS`). 오래 아프면 별이 되는 것은 노멀과 같다.
 *   2026-10-26 방치도 «일»이 됐다 — 배고픈 채로 · 심심한 채로 · 똥을 안 치운 채로 지나는 깨어 있는 칸마다 운을 본다.
 *   확률은 칸·씨앗 난수라 «나눠 따라잡기 = 한 번에»가 지켜지고, 같은 칸에서 다시 눌러도 운이 바뀌지 않는다.
 *   수업 중에는 하드도 시간이 멈춘다(학교 규칙이 먼저).
 */
export type PetMode = 'easy' | 'normal' | 'hard';
export const PET_MODES: readonly PetMode[] = ['easy', 'normal', 'hard'];

export const MODE_INFO: Record<PetMode, { label: string; badge: string; rule: string }> = {
  easy: {
    label: '이지',
    badge: '이지',
    rule: '펫이 죽지 않아요. 오래 혼자 두면 아프고, 주사를 맞으면 나아요.',
  },
  normal: {
    label: '노멀',
    badge: '노멀',
    rule: '아픈 채로 깨어 있는 시간이 하루(24시간)를 넘으면 위독해지고, 이틀(48시간)이 되면 별이 돼요. 수업·잠 시간은 세지 않아요. 주사를 다 맞으면 처음부터 다시 세요.',
  },
  hard: {
    label: '하드 · 개복치',
    badge: '개복치',
    rule: '개복치처럼 아주 사소한 일로도 별이 될 수 있어요. 밥을 먹다가, 산책하다가, 가만히 있다가도 — 언제, 왜일지는 아무도 몰라요. 배고프거나 심심한 채로, 똥을 그대로 둔 채로 내버려 두면 더 위험해요. 오래 아프면 별이 되는 건 노멀과 같아요. 수업 중에는 하드도 멈춰요.',
  },
};

/** 하드에서 별이 될 수 있는 «일» — 돌보기 하나 또는 저절로 일어나는 일 */
export type HardEvent =
  | 'meal' | 'snack' | 'walk' | 'gameWin' | 'gameLose' | 'pat' | 'clean' | 'medicine' | 'lights'
  | 'sleep' | 'wake' | 'poop' | 'evolve' | 'idle'
  /** 방치(2026-10-26) — 배고픈 채로 · 심심한 채로 · 똥을 안 치운 채로 «깨어 있는» 칸마다 */
  | 'hungry' | 'bored' | 'dirty';

/**
 * 일마다 — 확률(그 일이 한 번 일어날 때) · 뽑힐 이유들 · 다음 펫을 위한 한 줄.
 * 확률 기준(회귀 ⑤-3 이 잰다): 하루에 밥 3·간식 2·산책 2·놀이 3·쓰다듬기 5·씻기 3·불 1·잠 1·깨기 1·똥 5 와 깨어 있는
 *   ~110칸이면 하루에 별이 될 확률 ≈ 60% — 어른(사흘)까지 크는 개복치가 열에 하나 남짓(2026-10-22 «데스 이벤트가 너무 안 나온다» → 25% 에서 ×3).
 * `phrase` 는 «○○가 {phrase} 별이 되었어요» 자리 — 학생이 보는 글이라 끔찍하지 않게, 웃기되 놀리지 않는다.
 */
export const HARD_EVENTS: Record<HardEvent, { p: number; tip: string; causes: { id: string; phrase: string }[] }> = {
  meal: { p: 0.03, tip: '밥은 언제나 진지해요.', causes: [
    { id: 'rice_nose', phrase: '밥알 하나가 콧구멍으로 들어가서' },
    { id: 'meal_moved', phrase: '밥이 너무 맛있어서 감동한 나머지' },
    { id: 'spoon_face', phrase: '숟가락에 비친 자기 얼굴에 놀라서' },
    { id: 'bit_tongue', phrase: '밥을 먹다 혀를 깨물고 너무 억울해서' },
    { id: 'last_bite', phrase: '마지막 한 입을 누구에게 줄지 고민하다' },
  ] },
  snack: { p: 0.045, tip: '간식은 늘 위험한 유혹이에요.', causes: [
    { id: 'nitrogen_chips', phrase: '과자 봉지 속 질소에 너무 실망해서' },
    { id: 'jelly_twin', phrase: '자기를 닮은 젤리를 보고 깜짝 놀라서' },
    { id: 'choco_melt', phrase: '초콜릿이 녹는 걸 보고 너무 슬퍼서' },
    { id: 'wrapper_fail', phrase: '사탕 껍질이 안 까져서 분한 나머지' },
    { id: 'only_one', phrase: '간식이 딱 하나뿐이라 서운해서' },
    { id: 'overeat', phrase: '간식을 먹고 혈당이 너무 치솟아서' },
  ] },
  walk: { p: 0.06, tip: '산책길은 늘 모험이에요.', causes: [
    { id: 'squirrel', phrase: '산책하다 나무에서 떨어진 다람쥐를 맞고' },
    { id: 'pigeon', phrase: '산책길에 비둘기와 눈싸움을 하다 져서' },
    { id: 'dandelion', phrase: '민들레 씨앗에 재채기를 너무 크게 해서' },
    { id: 'leaf', phrase: '자기보다 큰 낙엽에 깔려서' },
    { id: 'snail', phrase: '달팽이를 따라가다 너무 느려서 지쳐서' },
    { id: 'sunburn', phrase: '산책하다 햇살이 너무 따뜻해서 그만' },
    { id: 'puddle', phrase: '웅덩이에 비친 자기 얼굴에 반해서' },
    { id: 'cat_stare', phrase: '담벼락 위 고양이와 눈이 마주쳐서' },
    { id: 'wind', phrase: '갑자기 분 바람에 날아가서' },
  ] },
  gameWin: { p: 0.03, tip: '이기는 것도 조심해야 해요.', causes: [
    { id: 'win_joy', phrase: '놀이에서 이겨 너무 기쁜 나머지' },
    { id: 'victory_dance', phrase: '승리의 춤을 추다 발이 꼬여서' },
    { id: 'trophy', phrase: '트로피가 너무 무거워서' },
  ] },
  gameLose: { p: 0.045, tip: '져 주는 것도 사랑…이 아니라, 이겨 주세요.', causes: [
    { id: 'sore', phrase: '놀이에서 진 게 너무 분해서' },
    { id: 'seven', phrase: '숫자 7이 너무 무서워서' },
    { id: 'left_right', phrase: '왼쪽 오른쪽을 헷갈리다 어지러워서' },
    { id: 'memo_heat', phrase: '순서를 외우다 머리가 너무 뜨거워져서' },
  ] },
  pat: { p: 0.024, tip: '사랑도 적당히.', causes: [
    { id: 'joy', phrase: '너무 행복해서 심장이 콩닥콩닥하다가' },
    { id: 'tickle', phrase: '간지럼을 너무 많이 타서' },
    { id: 'static', phrase: '쓰다듬는 손의 정전기에 찌릿해서' },
    { id: 'warm_hand', phrase: '손이 너무 따뜻해서 사르르 녹아서' },
  ] },
  clean: { p: 0.03, tip: '깨끗함도 낯설 수 있어요.', causes: [
    { id: 'bath', phrase: '너무 깨끗해진 자기 모습이 낯설어서' },
    { id: 'cold_water', phrase: '목욕물이 딱 1도 차가워서' },
    { id: 'soap_slip', phrase: '비누 거품에 미끄러져서' },
    { id: 'duck', phrase: '고무 오리에게 욕조 자리를 빼앗겨서' },
  ] },
  medicine: { p: 0.045, tip: '주사는 늘 무서워요.', causes: [
    { id: 'needle', phrase: '주사기를 보자마자 기절해서' },
    { id: 'bitter', phrase: '약이 너무 써서' },
    { id: 'no_pain', phrase: '주사가 하나도 안 아파서 오히려 놀라서' },
  ] },
  lights: { p: 0.03, tip: '불은 살살 켜고 꺼요.', causes: [
    { id: 'flash', phrase: '갑자기 켜진 불에 깜짝 놀라서' },
    { id: 'switch_click', phrase: '스위치 딸깍 소리에 놀라서' },
    { id: 'dark_shadow', phrase: '어둠 속에서 자기 그림자를 보고' },
  ] },
  sleep: { p: 0.015, tip: '꿈도 조심.', causes: [
    { id: 'exam_dream', phrase: '꿈에서 시험을 보다가' },
    { id: 'snore', phrase: '자기 코 고는 소리에 놀라서' },
    { id: 'fly_dream', phrase: '꿈속에서 너무 높이 날아올라서' },
    { id: 'glare', phrase: '잠들기 직전 별빛이 너무 눈부셔서' },
  ] },
  wake: { p: 0.03, tip: '아침은 늘 갑자기 와요.', causes: [
    { id: 'alarm', phrase: '알람 소리에 화들짝 놀라서' },
    { id: 'monday', phrase: '오늘이 월요일인 걸 알아 버려서' },
    { id: 'morning_sun', phrase: '아침 햇살이 너무 눈부셔서' },
    { id: 'bed_head', phrase: '거울 속 까치집 머리에 충격을 받아서' },
  ] },
  poop: { p: 0.024, tip: '…개복치니까요.', causes: [
    { id: 'mess', phrase: '자기 똥 냄새에 충격을 받아서' },
    { id: 'heart_poop', phrase: '똥이 하트 모양이라 너무 감격해서' },
    { id: 'poop_shy', phrase: '똥 싸는 걸 들킨 것 같아 너무 부끄러워서' },
  ] },
  evolve: { p: 0.09, tip: '자라는 것도 큰일이에요.', causes: [
    { id: 'new_look', phrase: '새 모습이 너무 멋져서 거울 앞에서 감격하다' },
    { id: 'growth_dizzy', phrase: '갑자기 커진 키에 어지러워서' },
    { id: 'old_clothes', phrase: '어제 입던 옷이 안 맞아 슬퍼서' },
  ] },
  idle: { p: 1 / 2000, tip: '가만히 있어도 일은 생겨요.', causes: [
    { id: 'thunder', phrase: '먼 데서 들린 천둥소리에 놀라서' },
    { id: 'wifi', phrase: '와이파이가 잠깐 끊긴 게 충격이라' },
    { id: 'exam', phrase: '«곧 시험 기간»이라는 말을 듣고' },
    { id: 'sneeze', phrase: '자기 재채기 소리에 놀라서' },
    { id: 'bell', phrase: '쉬는 시간 끝 종소리에 화들짝 놀라서' },
    { id: 'cloud', phrase: '창밖 구름이 무서운 모양이라' },
    { id: 'yawn', phrase: '하품을 너무 크게 하다가' },
    { id: 'gnat', phrase: '날파리와 눈이 마주쳐서' },
    { id: 'shadow', phrase: '자기 그림자를 보고 놀라서' },
  ] },
  // 방치(2026-10-26 사용자 요청 «배고픈 상황 혹은 즐겁지 않은 상황에서 방치하고 있어도, 똥을 치우지 않은 상태로 방치하고 있어도
  // 랜덤한 죽음»). 그 상태로 지나는 «깨어 있는» 칸마다 운을 본다 — 정해진 시간에 죽는 조건형(첫 하드)이 아니다.
  // 1시간 방치 ≈ 배고픔 22% · 심심함 17% · 똥 5%(칸마다 p, 12칸). 수업·잠 칸은 세지 않는다.
  hungry: { p: 0.02, tip: '배고픔은 기다려 주지 않아요.', causes: [
    { id: 'growl', phrase: '자기 배에서 난 꼬르륵 소리를 천둥인 줄 알고' },
    { id: 'eraser_rice', phrase: '지우개를 떡인 줄 알고 한 입 베어 물었다가' },
    { id: 'food_dream', phrase: '밥 먹는 상상을 너무 진지하게 하다가' },
    { id: 'menu_board', phrase: '급식 메뉴판만 하염없이 바라보다가' },
  ] },
  bored: { p: 0.015, tip: '심심함도 개복치에겐 큰일이에요.', causes: [
    { id: 'ceiling_count', phrase: '너무 심심해서 천장 무늬를 세다가 숫자를 잊어버려서' },
    { id: 'hide_seek', phrase: '혼자 숨바꼭질을 하다 너무 꼭꼭 숨어서' },
    { id: 'talk_self', phrase: '혼잣말을 하다 자기 말에 서운해서' },
    { id: 'clock_watch', phrase: '시계 초침만 바라보다 눈이 핑핑 돌아서' },
  ] },
  dirty: { p: 0.004, tip: '똥은 바로바로 치워 주세요.', causes: [
    { id: 'poop_friend', phrase: '똥을 친구인 줄 알고 말을 걸었는데 대답이 없어서' },
    { id: 'fly_chase', phrase: '똥 주위에 모여든 파리를 쫓다 지쳐서' },
    { id: 'poop_slip', phrase: '치우지 않은 똥을 밟고 미끄러져서' },
    { id: 'poop_tower', phrase: '쌓인 똥이 탑처럼 높아져 와르르 무너지는 바람에' },
  ] },
};

/** 노멀·하드 공통 — 오래 아파서 */
const SICK = { phrase: '오래 아픈 채로 혼자 있다가', tip: '아프면 주사를 먼저 놓아 주세요.' };

/**
 * 같은 날 첫 하드(조건형)에서 쓰던 이유 — 그때 별이 된 펫의 저장값이 이 id 를 갖고 있어 읽기만 남긴다.
 * 새 별에는 쓰지 않는다(새 판의 이유와 id 가 같으면 거기 것을 쓴다).
 */
const LEGACY: Record<string, { phrase: string; tip: string }> = {
  starve: { phrase: '배가 너무 고파서', tip: '…개복치니까요.' },
  lonely: { phrase: '아무도 놀아 주지 않아 외로워서', tip: '…개복치니까요.' },
  needle: { phrase: '아프지도 않은데 주사를 보고 놀라서', tip: '주사는 늘 무서워요.' },
};

export type DeathCause = string;

/** 이유 id → 글. 새 판(HARD_EVENTS) · 오래 아파서 · 옛 id 를 한 표로 */
export const DEATH_CAUSE: Record<string, { phrase: string; tip: string; event?: HardEvent }> = (() => {
  const out: Record<string, { phrase: string; tip: string; event?: HardEvent }> = { ...LEGACY, sick: SICK };
  for (const [event, def] of Object.entries(HARD_EVENTS) as [HardEvent, (typeof HARD_EVENTS)[HardEvent]][]) {
    for (const c of def.causes) out[c.id] = { phrase: c.phrase, tip: def.tip, event };
  }
  return out;
})();

export const isDeathCause = (v: unknown): v is DeathCause => typeof v === 'string' && Object.prototype.hasOwnProperty.call(DEATH_CAUSE, v);
export const isPetMode = (v: unknown): v is PetMode => typeof v === 'string' && (PET_MODES as readonly string[]).includes(v);
/** 이유 글 — 모르는 id 는 «오래 아파서»로(깨진 값으로 화면을 죽이지 않는다) */
export const deathCauseOf = (id: string | null | undefined) => (id && isDeathCause(id) ? DEATH_CAUSE[id] : SICK);
