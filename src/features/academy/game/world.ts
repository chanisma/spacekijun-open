export type Place = 'plaza' | 'library' | 'observatory' | 'post' | 'dorm';
export type Npc = 'luon' | 'librarian' | 'professor' | 'postmaster' | 'serin' | 'lamplighter';
export type Interaction = Place | Npc | 'shelf' | 'study' | 'telescope' | 'desk' | 'mailbox' | 'writing' | 'window' | 'planner' | 'wardrobe' | 'shop';
export interface Hotspot { id: Interaction; label: string; x: number; y: number; walkX: number; walkY: number; icon: string }
export const placeNames: Record<Place, string> = { plaza: '중앙 광장', library: '왕립 도서관', observatory: '별의 연구시설', post: '전서구 우편국', dorm: '별빛 기숙사' };
export const npcDetails: Record<Npc, { name: string; role: string; asset: string }> = {
  luon: { name: '루온', role: '아카데미 안내자', asset: 'luon' },
  librarian: { name: '엘리안', role: '왕립 도서관 사서', asset: 'librarian-male' },
  professor: { name: '카시안', role: '별의 연구시설 교수', asset: 'professor' },
  postmaster: { name: '노엘', role: '왕립 우편 배달부', asset: 'postmaster' },
  lamplighter: { name: '테오', role: '아카데미 등불지기', asset: 'lamplighter' },
  serin: { name: '세린', role: '별빛 기숙사의 룸메이트 선배', asset: 'serin' },
};
export const placeNpcs: Record<Place, Npc | null> = { plaza: 'luon', library: 'librarian', observatory: 'professor', post: 'postmaster', dorm: 'serin' };
export function isGamePlace(value: unknown): value is Place { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(placeNames, value); }
export const hotspots: Record<Place, Hotspot[]> = {
  plaza: [
    { id: 'lamplighter', label: '등불지기 테오와 이야기하기', x: 73, y: 78, walkX: 67, walkY: 80, icon: '☼' },
    { id: 'dorm', label: '별빛 기숙사', x: 38, y: 47, walkX: 38, walkY: 67, icon: '☽' },
    { id: 'luon', label: '루온과 대화', x: 51, y: 86, walkX: 43, walkY: 78, icon: '!' },
    { id: 'library', label: '왕립 도서관', x: 12, y: 48, walkX: 18, walkY: 67, icon: '⌂' },
    { id: 'observatory', label: '별의 연구시설', x: 65, y: 47, walkX: 68, walkY: 67, icon: '✧' },
    { id: 'post', label: '전서구 우편국', x: 91, y: 49, walkX: 86, walkY: 69, icon: '✉' },
  ],
  library: [
    { id: 'plaza', label: '중앙 광장', x: 15, y: 44, walkX: 17, walkY: 66, icon: '↩' },
    { id: 'shelf', label: '책장에서 책 꺼내기', x: 39, y: 35, walkX: 39, walkY: 65, icon: '▤' },
    { id: 'study', label: '자습 기록장 펼치기', x: 56, y: 59, walkX: 53, walkY: 73, icon: '✎' },
    { id: 'librarian', label: '사서 엘리안과 대화', x: 76, y: 87, walkX: 67, walkY: 77, icon: '!' },
    // 제6장: 제5장을 마치면 세린이 수요일의 창가 자리(도서관)에도 선다.
    { id: 'serin', label: '세린과 책 이야기', x: 30, y: 87, walkX: 37, walkY: 78, icon: '▤' },
  ],
  observatory: [
    { id: 'plaza', label: '중앙 광장', x: 10, y: 43, walkX: 16, walkY: 70, icon: '↩' },
    { id: 'telescope', label: '망원경 들여다보기', x: 32, y: 37, walkX: 33, walkY: 70, icon: '✧' },
    { id: 'desk', label: '연구대 보기', x: 54, y: 55, walkX: 53, walkY: 76, icon: '✎' },
    { id: 'professor', label: '카시안 교수와 대화', x: 81, y: 88, walkX: 71, walkY: 78, icon: '…' },
  ],
  post: [
    { id: 'plaza', label: '중앙 광장', x: 10, y: 43, walkX: 16, walkY: 70, icon: '↩' },
    { id: 'mailbox', label: '전서구의 편지 받기', x: 35, y: 37, walkX: 33, walkY: 69, icon: '✉' },
    { id: 'writing', label: '책상에서 관측 일지 펼치기', x: 53, y: 55, walkX: 53, walkY: 77, icon: '✎' },
    { id: 'postmaster', label: '배달부 노엘과 대화', x: 76, y: 89, walkX: 69, walkY: 78, icon: '…' },
  ],
  // 이름은 없앤 «기숙사 감상» 방 메뉴의 이름 그대로(2026-10-03) — 학생이 이미 아는 말이다.
  dorm: [
    { id: 'serin', label: '세린과 이야기하기', x: 67, y: 91, walkX: 58, walkY: 78, icon: '✧' },
    // 자리(2026-10-03 세계로 옮기며 다시 잡음) — 책상 왼쪽에 셋이 몰려 작은 화면에서 이름표가 겹쳤다:
    // 중앙 광장 = 왼쪽 문틀 아래, 공방 주문서 = 오른쪽 아래 책 쌓인 둥근 탁자. 세로 화면(평면 = 화면 폭)에서 이름표가 잘리지 않게 가장자리에서 10% 이상 안쪽.
    { id: 'plaza', label: '중앙 광장', x: 10, y: 43, walkX: 14, walkY: 78, icon: '↩' }, // 2026-10-06 — 종전 (11, 68) 은 펼친 기능 서랍(궤도) 아래로 숨었다. 다른 장소처럼 왼쪽 위로
    { id: 'planner', label: '플래너 펼치기', x: 17, y: 50, walkX: 29, walkY: 74, icon: '✎' },
    { id: 'wardrobe', label: '옷장 · 방 꾸미기', x: 86, y: 42, walkX: 73, walkY: 75, icon: '◇' },
    { id: 'shop', label: '공방 주문서 쓰기', x: 85, y: 74, walkX: 80, walkY: 80, icon: '✦' },
    // 창가 — 방 그림의 아치 창(2026-10-03, 기숙사 감상 패널의 «밤하늘 보기»를 세계로 옮김). 창가의 하늘이 열린 뒤에만 보인다(AcademyGame 의 핫스팟 거르기).
    { id: 'window', label: '밤하늘 보기', x: 59, y: 24, walkX: 55, walkY: 74, icon: '☾' },
  ],
};
export interface WorldBridge {
  interact: (id: Interaction) => void;
  travel: (place: Place) => void;
  pause: (paused: boolean) => void;
  motion: (reduced: boolean) => void;
  wardrobe: (outfit: Record<import('./workshopModel').WorkshopSlot, string>) => void;
  /** 장소마다 터줏대감 NPC(`placeNpcs`) 말고 **더 서 있는 인물** — 제5장 뒤 광장의 테오처럼 이야기가 풀어 준 사람. */
  actors: (extras: Partial<Record<Place, Npc[]>>) => void;
  destroy: () => void;
}

/** 한국어 조사 «으로/로» — 받침이 없거나 ㄹ 받침이면 «로». 장소 이름 뒤에 붙인다(«별빛 기숙사로», «중앙 광장으로»). */
export function withEuro(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const final = code % 28;
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
}
