/**
 * 여러 직업으로 시즌 하나씩 끝까지 — `npx tsx scripts/isekai3d-episode-test/sweep.mts <out.json> [직업…]`
 * 서버와 같은 프롬프트·검사·모델(gpt-6-luna)로, 결정은 장면마다 1번·2번 선택지를 번갈아 고른다. DB 는 쓰지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOutline, checkScene, episodePayload, episodeSystemPrompt, parseEpisodeRequest, type EpisodeOutline, type EpisodeScene, type PastScene } from '../../supabase/functions/_shared/isekai3dEpisode.ts';
import { MODEL } from '../../supabase/functions/isekai3d-episode/handler.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = Object.fromEntries(readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]));
const KEY = env.OPENAI_API_KEY;

const P = (id: number, name: string, role: string, gender: string, traits: string[], extra: Record<string, unknown> = {}) => ({ id, name, role, gender, traits, ...extra });
/** 게임의 episodeRequest 와 같은 모양 (직장 정보는 workplace.ts 에서) + workplace(직장의 실제 일 — 프롬프트가 쓰면) */
export const CASES: Record<string, Record<string, unknown>> = {
  busDriver: {
    career: { id: 'busDriver', label: '버스 기사', levelLabel: '광역버스 기사', stage: '전문', branch: '노선 운행', work: ['장거리 운행 점검하기'], dailyPay: 350 },
    dweller: { traits: ['성실함', '느긋함'], emotion: 'focused', gender: 'male' },
    cast: [P(3101, '윤노선', '운수과장', 'male', ['원칙주의'], { goal: '이번엔 꼭 승진하기', worry: '평가 받는 두려움' }), P(3102, '신정류', '기사', 'female', ['수다쟁이', '친절함'], { joy: '강아지를 입양했어요', bonds: ['배환승: 라이벌'] }), P(3103, '배환승', '기사', 'male', ['경쟁심'], { goal: '실력을 인정받기', worry: '돈 걱정', bonds: ['신정류: 라이벌'] })],
    workplace: { place: '버스 차고지', tasks: ['노선 운행', '차량 점검', '요금 정산', '노선 숙지', '승객 응대', 'CNG 충전', '분실물 정리', '과장님께 운행 보고'], clients: ['승객'], rush: '출퇴근 승객이 몰려 증편 운행이 필요해요' },
  },
  nurse: {
    career: { id: 'nurse', label: '간호사', levelLabel: '경력 간호사', stage: '실무', branch: '간호 관리자', work: ['담당 환자 간호 계획 세우기'], dailyPay: 280 },
    dweller: { traits: ['꼼꼼함', '걱정 많음'], emotion: 'stressed', gender: 'female' },
    cast: [P(3201, '문혜진', '수간호사', 'female', ['카리스마'], { goal: '좋은 선배가 되기' }), P(3202, '조은비', '간호사', 'female', ['덜렁댐', '밝음'], { worry: '실력이 들통날까 봐 두려움', joy: '시험에 합격했어요', bonds: ['백승우: 친한 사이'] }), P(3203, '백승우', '간호사', 'male', ['차분함'], { goal: '해외에서 일해 보기', bonds: ['조은비: 친한 사이'] })],
    workplace: { place: '종합병원 병동', tasks: ['주사 놓기·활력 징후 재기', '약 준비하기', '환자 호출벨 응답하기', '수액 교체하기', '간호 기록 작성하기', '근무 교대 인수인계', '환자 체위 변경', '환자 안심시키기'], clients: ['환자'] },
  },
  culinary: {
    career: { id: 'culinary', label: '요리사', levelLabel: '설거지 담당', stage: '입문', work: ['칼질 기본기 연습하기'], dailyPay: 60 },
    dweller: { traits: ['열정적', '덤벙댐'], emotion: 'happy', gender: 'female' },
    cast: [P(3301, '최수아', '셰프', 'female', ['완벽주의', '까칠함'], { goal: '이 분야 최고의 장인 되기' }), P(3302, '정하준', '조리사', 'male', ['장난꾸러기'], { goal: '언젠가 내 가게(회사) 차리기', worry: '이루지 못한 꿈에 대한 두려움' }), P(3303, '윤예린', '조리사', 'female', ['조용함'], { joy: '드디어 어려운 기술을 해냈어요', worry: '거절당할까 봐 두려움' })],
    workplace: { place: '레스토랑 주방', tasks: ['주문 요리 만들기', '재료 손질하기', '요리 플레이팅하기', '셰프에게 맛 평가받기', '맛 보기', '설거지하기', '주방 마감 청소'] },
  },
  webtoonArtist: {
    career: { id: 'webtoonArtist', label: '웹툰 작가', levelLabel: '웹툰 스튜디오 대표', stage: '리더', branch: '인기 웹툰 작가', work: ['독자 반응 분석하기', '어시스턴트 작업 배분하기'], dailyPay: 1100 },
    dweller: { traits: ['창의적', '완벽주의'], emotion: 'inspired', gender: 'male' },
    cast: [P(3401, '여은하', '편집자', 'female', ['현실적'], { goal: '실력을 인정받기' }), P(3402, '도현지', '어시스턴트', 'female', ['야심참'], { goal: '언젠가 내 가게(회사) 차리기', joy: '어제 한 일이 칭찬받았어요' }), P(3403, '마윤서', '어시스턴트', 'male', ['느긋함', '유머러스'], { worry: '전망이 어두운 직업에 대한 두려움' })],
    workplace: { place: '웹툰 스튜디오', tasks: ['원고 그리기', '채색하기', '스토리 구상하기', '콘티 그리기', '독자 사인회', '마감 원고 업로드', '원고 교정 보기', '독자 반응 확인하기', '편집자님과 회의하기'], clients: ['독자'], rush: '연재 마감 2시간 전' },
  },
  elevatorTech: {
    career: { id: 'elevatorTech', label: '승강기 정비원', levelLabel: '선임 정비원', stage: '실무', branch: '현장 정비', work: ['고장 원인 찾아 수리하기'], dailyPay: 284 },
    dweller: { traits: ['차분함', '고집셈'], emotion: 'focused', gender: 'female' },
    cast: [P(3501, '우승강', '센터장', 'male', ['현실적'], { worry: '돈 걱정' }), P(3502, '권로프', '정비원', 'male', ['자신만만'], { goal: '자격증 따기', bonds: ['하안전: 라이벌'] }), P(3503, '하안전', '검사원', 'female', ['원칙주의'], { goal: '실력을 인정받기', bonds: ['권로프: 라이벌'] })],
    workplace: { place: '승강기 서비스센터', tasks: ['정기 점검', '승강기 점검·정비', '원격 감시', '기계실 장비 점검', '갇힘 응대 · 배차', '점검 보고서', '관리소장 상담'], clients: ['건물 관리소장'], rush: '엘리베이터 갇힘 신고' },
  },
  haenyeo: {
    career: { id: 'haenyeo', label: '해녀', levelLabel: '중군 해녀', stage: '전문', branch: '물질', work: ['물때 따져 물질 정하기'], dailyPay: 322 },
    dweller: { traits: ['용감함', '욕심 많음'], emotion: 'confident', gender: 'female' },
    cast: [P(3601, '고순덕', '해녀회장', 'female', ['엄격함', '정 많음'], { goal: '좋은 선배가 되기' }), P(3602, '양미자', '상군 해녀', 'female', ['고집셈'], { worry: '전망이 어두운 직업에 대한 두려움', bonds: ['김해솔: 서로 신경 쓰는 사이'] }), P(3603, '김해솔', '중군 해녀', 'female', ['밝음', '경쟁심'], { goal: '실력을 인정받기', joy: '부모님이 처음으로 일하는 곳을 보러 오신대요' })],
    workplace: { place: '해녀의 집', tasks: ['물질', '해산물 손질', '장비 손질', '불턱에서 쉬며 이야기', '관광객 응대', '소라 채취', '물때 달력 보기', '미역 말리기', '해녀회장님께 인사'], clients: ['관광객'], rush: '소라 채취가 열렸어요' },
  },
  convenienceManager: {
    career: { id: 'convenienceManager', label: '편의점 점장', levelLabel: '편의점 아르바이트', stage: '입문', work: ['계산대 사용법 배우기'], dailyPay: 75 },
    dweller: { traits: ['사교적', '덤벙댐'], emotion: 'happy', gender: 'male' },
    cast: [P(3701, '김본사', '본사 슈퍼바이저', 'male', ['깐깐함'], { goal: '이번엔 꼭 승진하기' }), P(3702, '이알바', '아르바이트', 'female', ['느긋함'], { worry: '막막한 미래에 대한 두려움', joy: '주말에 여행 가기로 했어요' }), P(3703, '박야간', '야간 아르바이트', 'male', ['과묵함'], { worry: '돈 걱정', goal: '자격증 따기' })],
    workplace: { place: '편의점', tasks: ['계산하기', '상품 진열', '발주 넣기', '유통기한 점검', '택배 접수', '손님 응대', '납품 검수', '매장 청소', '본사 슈퍼바이저님께 매출 보고'], clients: ['편의점 손님'], rush: '점심시간이라 손님 줄이 길어요' },
  },
  socialWorker: {
    career: { id: 'socialWorker', label: '사회복지사', levelLabel: '복지관 사무국장', stage: '리더', branch: '지역사회 복지', work: ['주민 모임 열기', '후원처와 협약하기'], dailyPay: 727 },
    dweller: { traits: ['다정함', '책임감'], emotion: 'focused', gender: 'female' },
    cast: [P(3801, '윤정희', '관장', 'female', ['현실적', '외교적'], { goal: '가족에게 자랑스러운 사람 되기' }), P(3802, '조하나', '사회복지사', 'female', ['열정적'], { worry: '실패 공포증', joy: '후배가 고맙다고 편지를 줬어요', bonds: ['민경수: 단짝'] }), P(3803, '민경수', '사회복지사', 'male', ['느긋함'], { goal: '일과 삶의 균형 찾기', bonds: ['조하나: 단짝'] })],
    workplace: { place: '종합사회복지관', tasks: ['사례 관리', '어르신 상담', '경로식당 배식', '후원 물품 정리', '어르신 댁 방문', '어르신 · 아이 프로그램', '자원봉사 · 프로그램 안내', '관장님께 사례 보고'], clients: ['어르신'], rush: '혼자 사는 어르신과 연락이 안 돼요' },
  },
};

// 로컬 OPENAI 키가 없으면 배포된 openai-proxy 로 (openai-features-live-test 처럼 서비스 키로 만든 1회용 관리자 세션)
const URL = 'https://your-project-ref.supabase.co';
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? readFileSync(resolve(root, '.env'), 'utf8').match(/^VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
let token = '';
async function session() {
  const sv = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  const email = (await (await fetch(`${URL}/rest/v1/profiles?role=eq.admin&select=email&limit=1`, { headers: sv })).json())[0]?.email;
  const link = await (await fetch(`${URL}/auth/v1/admin/generate_link`, { method: 'POST', headers: sv, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  const v = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token ?? link.properties?.hashed_token }) })).json();
  if (!v.access_token) throw new Error('no session');
  token = v.access_token;
}
const json = (t: string) => {
  let x = t.slice(t.indexOf('{'));
  try { return JSON.parse(x); } catch (e) {
    const at = Number(String((e as Error).message).match(/position (\d+)/)?.[1]);
    if (at) return JSON.parse(x.slice(0, at));
    throw e;
  }
};
async function chat(system: string, payload: unknown): Promise<Record<string, unknown>> {
  if (KEY?.startsWith('sk-') && !KEY.startsWith('sk-AIza')) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ model: MODEL, reasoning_effort: 'low', max_completion_tokens: 12_000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return json((await r.json()).choices[0].message.content);
  }
  const r = await fetch(`${URL}/functions/v1/openai-proxy`, {
    method: 'POST',
    headers: { apikey: ANON!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ action: 'chatCompletion', systemPrompt: system, userPrompt: JSON.stringify(payload), model: MODEL, reasoningEffort: 'low', maxCompletionTokens: 12_000, aiLog: { feature: 'isekai3d-episode-sweep' } }),
  });
  const b = await r.json();
  if (!r.ok || b.error) throw new Error(`HTTP ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
  if (b.finishReason === 'length') throw new Error('length');
  return json(b.result ?? b.content);
}

async function season(id: string) {
  const req = parseEpisodeRequest({ gameKey: `sweep${id.slice(0, 8).toLowerCase()}:1`, ...CASES[id] });
  const why: string[] = [];
  let outline: EpisodeOutline | null = null;
  const past: PastScene[] = [];
  let tries = 0;
  for (let i = 0; i < 3 && !outline; i++) {
    tries++;
    const reply = await chat(episodeSystemPrompt('season'), episodePayload(req, { pastTitles: [] }));
    outline = checkOutline(reply.outline, req, why);
    const s = outline && checkScene(reply.scene, outline, req, false, why);
    if (!s) outline = null;
    else past.push({ idx: 0, scene: s, choice: 0, text: null });
  }
  if (!outline) return { id, error: 'no season', why, tries };
  const total = Math.min(5, Math.max(3, outline.beats.length));
  while (past.length < total) {
    const final = past.length + 1 >= total;
    let scene: EpisodeScene | null = null;
    for (let i = 0; i < 3 && !scene; i++) {
      tries++;
      const reply = await chat(episodeSystemPrompt('next'), episodePayload(req, { outline, past, sceneIndex: past.length + 1 }));
      scene = checkScene(reply.scene, outline, req, final, why);
    }
    if (!scene) return { id, outline, past, error: 'no scene', why, tries };
    past.push({ idx: past.length, scene, choice: past.length % 2, text: null });
  }
  return { id, outline, past, why, tries };
}

const out = process.argv[2];
const ids = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(CASES);
const t0 = Date.now();
if (!(KEY?.startsWith('sk-') && !KEY.startsWith('sk-AIza'))) await session();
const results = await Promise.all(ids.map((id) => season(id).catch((e) => ({ id, error: String(e) }))));
// 이 세션만 로그아웃
if (token) await fetch(`${URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: ANON!, Authorization: `Bearer ${token}` } });
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`${results.length} seasons, ${Math.round((Date.now() - t0) / 1000)}s →`, out);
for (const r of results as Array<Record<string, any>>) console.log(r.id, r.error ?? `${r.past.length} scenes, ${r.tries} calls, rejected: ${r.why.length}`);
