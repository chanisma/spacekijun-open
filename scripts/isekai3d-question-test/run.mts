/**
 * 이세계 3D 질문 회귀 — `npx tsx scripts/isekai3d-question-test/run.mts`
 *
 * 조용히 틀리는 자리를 못 박는다:
 *  ① 금칙어 검사가 멀쩡한 낱말(기술·예술·수술)을 막거나, 막아야 할 것(감전·술자리)을 통과시킨다
 *  ② 성과 크기·돈 범위·도전의 역량이 게임이 모르는 값으로 들어간다 (게임에서 카드가 깨진다)
 *  ③ 맥락 키가 요청 내용과 다르다 → 다른 직업의 대기열에 카드가 쌓인다
 *  ④ 동의하지 않은 학생, 기억을 끈 학생, 대기열이 남은 학생에게 AI 를 부른다(비용·개인정보)
 *  ⑤ 학생 이름·직접 쓴 글이 모델에게 간다
 *  ⑥ SQL 권한: anon 실행, 학생이 쓰기 함수(isekai3d_questions_add)를 직접 부름, 표 직접 접근
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ISEKAI3D_BATCH,
  checkTaskCard,
  checkCareerCard,
  checkIsekai3dCards,
  checkThinkCard,
  hangulShare,
  parseIsekai3dRequest,
  similarity,
  isekai3dPayload,
  isekai3dSystemPrompt,
  type Isekai3dContext,
} from '../../supabase/functions/_shared/isekai3dQuestion.ts';
import { handleIsekai3dQuestion } from '../../supabase/functions/isekai3d-question/handler.ts';
import { answerState, cardText, chosenLabel, contextLabel, realPlayLabel, ISEKAI3D_PLAY_KEYS } from '../../src/components/admin/isekai3dAdminStats.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let failed = 0;
const ok = (cond: unknown, name: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`); }
};
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

const career = {
  id: 'doctor', label: '의사', level: 2, levelLabel: '레지던트', dailyPay: 200,
  skills: [{ key: 'medicine', label: '의학' }, { key: 'logic', label: '논리' }],
  rung: '3/10', stage: { key: 'junior', label: '입문', desc: '선배 곁에서 기본기를 익혀요' }, stageWork: ['회진 따라가며 기록하기'],
};
const request = (over: Record<string, unknown> = {}) => ({
  kind: 'career', contextKey: 'career:doctor:2',
  context: {
    career, commonSkills: [{ key: 'empathy', label: '공감' }], moods: [{ key: 'focused', label: '집중' }],
    dweller: { traits: ['친절함'], emotion: '집중', age: '어른' },
    insights: ['신중하고 안전한 방법을 고르는 편이에요'], recent: ['{n}·의사: 환자 상태 → \'다시 살피기\' (잘 풀림)'], avoid: [],
  },
  ...over,
});
const ctx = parseIsekai3dRequest(request()).context as Isekai3dContext;
const good = {
  text: '{n:이/가} 맡은 환자의 검사 결과가 평소와 조금 달라 보여요. 선배는 바빠 보입니다.',
  choices: [
    { label: '스스로 원인 찾기', approach: 'self', skill: 'medicine', mood: 'focused', need: 4, win: { text: '원인을 찾아 칭찬받았어요.', perf: 15 }, lose: { text: '시간만 걸렸어요.', perf: -10 } },
    { label: '바쁜 선배와 함께 보기', approach: 'together', skill: 'empathy', need: 3, win: { text: '선배와 함께 짚으며 배웠어요.', perf: 7 }, lose: { text: '선배를 기다리느라 늦어졌어요.', perf: -10 } },
    { label: '기록해 두고 보고하기', approach: 'safe', win: { text: '절차대로 보고했어요.', perf: 7 } },
  ],
};

console.log('① 요청');
ok(throws(() => parseIsekai3dRequest({ kind: 'chat' })), '모르는 종류는 거절');
ok(throws(() => parseIsekai3dRequest(request({ contextKey: 'career:nurse:2' }))), '맥락 키가 직업·단계와 다르면 거절');
ok(throws(() => parseIsekai3dRequest({ kind: 'life', contextKey: 'life:fire', context: { event: 'fire' } })), '정한 넷이 아닌 사건은 거절(화재·도난 같은 특수한 사건)');
ok(!throws(() => parseIsekai3dRequest({ kind: 'life', contextKey: 'life:childBorn', context: { event: 'childBorn' } })), '큰 사건 성찰 요청');
ok(!throws(() => parseIsekai3dRequest({ kind: 'explore', contextKey: 'explore', context: { explored: ['의료', '예술'] } })), '진로 탐색 요청');
const long = parseIsekai3dRequest(request({ context: { ...request().context, insights: Array(20).fill('가'.repeat(200)) } }));
ok(long.context.insights.length === 8 && long.context.insights[0].length === 80, '목록·글자 수 상한');
ok(ctx.career?.stage?.key === 'junior' && ctx.career.rung === '3/10' && ctx.career.stageWork[0] === '회진 따라가며 기록하기', '직업의 단계·단계 업무가 온다');
ok(parseIsekai3dRequest(request({ context: { ...request().context, career: { ...career, stage: { key: 'boss' } } } })).context.career?.stage === undefined, '모르는 단계는 버린다');
ok(/입문\(junior\)[\s\S]*리더\(leader\)/.test(isekai3dSystemPrompt('career')) && JSON.stringify(isekai3dPayload(parseIsekai3dRequest(request()))).includes('stageWork'), '프롬프트가 단계에 맞추라고 하고, 단계가 모델에게 간다');

console.log('② 근무 카드 검사');
ok(checkCareerCard(good, ctx) !== null, '알맞은 카드는 통과');
ok(checkCareerCard({ ...good, text: '점심 무렵, 단골 손님이 평소와 달리 말이 없고 표정이 어두웠어요.' }, ctx) !== null, '이름 없는 상황 글도 된다');
ok(checkCareerCard({ ...good, text: '{n:으로} 근무 중에 처음 보는 증상의 환자를 만났어요.' }, ctx) === null, '게임이 모르는 조사 꼴은 거절');
ok(checkCareerCard({ ...good, text: '{n:은} 오늘 처음 보는 증상의 환자를 만났어요.' }, ctx)?.text.startsWith('{n:은/는}'), '한쪽만 쓴 조사 꼴은 두 꼴로');
ok(checkCareerCard({ ...good, text: '{1:은/는} 오늘 증례 회의를 주재해야 해요. 자료가 아직 덜 됐어요.' }, ctx)?.text.startsWith('{n:은/는}'), '번호 이름 자리 {1} 은 {n} 으로');
ok(checkCareerCard({ ...good, text: '{n}은({n}) 오늘 증례 회의를 주재해야 해요. 자료가 아직 덜 됐어요.' }, ctx)?.text.startsWith('{n:은/는} 오늘'), '이름을 두 번 쓴 것은 하나로');
ok(checkCareerCard({ ...good, text: '{n:이/가} 회의를 열어요. 그런데 후배 {2:가} 발표 자료를 덜 만들었어요.' }, ctx) === null, '다른 번호 자리({2:가})는 거절');
ok(checkCareerCard({ ...good, text: good.text + ' 동기가 hurriedly 다시 적어요.' }, ctx) === null && checkCareerCard({ ...good, text: good.text + ' CT 결과도 봐요.' }, ctx) !== null, '영어 낱말은 거절, 대문자 줄임말은 된다');
ok(checkCareerCard({ ...good, text: good.text + ' 감전될 뻔했어요.' }, ctx) === null, '감전 거절');
ok(checkCareerCard({ ...good, text: good.text + ' 끝나고 술자리가 있어요.' }, ctx) === null, '술자리 거절');
ok(checkCareerCard({ ...good, text: good.text + ' 새 기술과 예술 치료, 수술 일정도 있어요.' }, ctx) !== null, '기술·예술·수술은 통과');
const perf = structuredClone(good); perf.choices[1].win.perf = 10; perf.choices[0].lose!.perf = -14;
const snapped = checkCareerCard(perf, ctx);
ok(snapped?.choices[1].win.perf === 7 && snapped?.choices[0].lose?.perf === -10, '성과는 가장 가까운 참고 게임 크기로 맞춘다');
ok(checkCareerCard({ ...good, choices: good.choices.slice(0, 2) }, ctx) === null, '선택은 셋');
ok(checkCareerCard({ ...good, choices: [good.choices[0], good.choices[0], good.choices[2]] }, ctx) === null, '방식은 하나씩');
const typed = structuredClone(good); typed.choices[2].label = '확실한 방법으로 보고하기';
ok(checkCareerCard(typed, ctx) === null, '선택지 글에 유형(확실·도전·역량)을 쓰면 거절');
const risky = structuredClone(good); (risky.choices[2] as Record<string, unknown>).lose = { text: '늦었어요', perf: -10 }; (risky.choices[2] as Record<string, unknown>).skill = 'logic';
ok(checkCareerCard(risky, ctx) === null, '안전한 길은 도전이 아님');
const selfSure = structuredClone(good); delete (selfSure.choices[0] as { lose?: unknown }).lose;
ok(checkCareerCard(selfSure, ctx) === null, '스스로 해결은 도전');
const togetherSure = structuredClone(good); delete (togetherSure.choices[1] as { lose?: unknown }).lose; togetherSure.choices[1].win.perf = 7;
ok(checkCareerCard(togetherSure, ctx) !== null, '함께 해결은 확실하고 작아도 된다');
const plain = structuredClone(good); plain.choices[1].label = '불확실한 부분은 선배와 함께 봐요';
ok(checkCareerCard(plain, ctx) !== null, '«불확실한» 같은 보통 말은 유형 말이 아니다');
const skill = structuredClone(good); skill.choices[1].skill = 'cooking';
ok(checkCareerCard(skill, ctx) === null, '직업·공통 역량이 아닌 도전은 거절');
const rich = structuredClone(good); (rich.choices[2].win as { money?: number }).money = 999;
ok(checkCareerCard(rich, ctx) !== null && checkCareerCard(rich, ctx)!.choices[2].win.money === undefined, '돈이 일당 -0.5~1배 밖이면 빼고 카드는 살린다');
const named = checkCareerCard({ ...good, text: '{n}·병원: {n}이는 오늘 처음 맡은 환자 기록을 검토하다가 애매한 결과를 봤어요.' }, ctx);
ok(named?.text === '{n:은/는} 오늘 처음 맡은 환자 기록을 검토하다가 애매한 결과를 봤어요.', '요약 머리를 떼고 이름 조사를 게임 꼴로');
const sure = structuredClone(good); sure.choices[2].win.perf = 25;
ok(checkCareerCard(sure, ctx) === null, '확실한 길의 큰 이득은 거절');
const softLose = structuredClone(good); softLose.choices[0].lose!.perf = 7;
ok(checkCareerCard(softLose, ctx) === null, '실패가 이득이면 거절');
ok(checkCareerCard(good, { ...ctx, avoid: [good.text] }) === null, '최근 카드와 비슷하면 거절');
ok(hangulShare('Hello world 안녕') < 0.6, '한글 비율');
ok(similarity('{n}이 환자를 돌봐요', '{n:이/가} 환자를 돌봐요') > 0.5, '{n} 은 유사도에서 뺀다');

console.log('③ 생각 질문 검사');
const think = { text: '소중한 사람이 곁에 있다는 건 어떤 의미일까요?', options: ['함께 보낸 시간', '서로 믿는 마음', '힘들 때 기대는 것'] };
ok(checkThinkCard(think, ctx) !== null, '알맞은 질문은 통과');
ok(checkThinkCard({ ...think, options: ['하나', '둘'] }, ctx) === null, '보기는 3–4개');
ok(checkThinkCard({ ...think, options: ['같음', '같음', '다름'] }, ctx) === null, '같은 보기 거절');
ok(checkThinkCard({ ...think, options: [...think.options, '직접 써 보기'] }, ctx)?.options.length === 3, '«직접 써 보기» 보기는 뺀다');
ok(checkIsekai3dCards({ cards: [good, good, good, good] }, parseIsekai3dRequest(request())).length === 1, '서로 같은 카드는 하나만');

console.log('④⑤ 함수 흐름');
const calls: string[] = [];
let sent: unknown = null;
const fakeDb = (status: Record<string, unknown>) => ({ rpc: async (name: string) => { calls.push(name); return { data: status, error: null }; } });
let stored: { p_model?: string; p_context?: unknown } = {};
const writer = { rpc: async (name: string, args: { p_cards: unknown[]; p_model?: string; p_context?: unknown }) => { calls.push(`${name}:${args.p_cards.length}`); stored = args; return { data: { status: 'filled', count: args.p_cards.length }, error: null }; } };
const ai = (async (_url: string, init: RequestInit) => {
  sent = JSON.parse(JSON.parse(String(init.body)).messages[1].content);
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ cards: [good] }) } }] }));
}) as unknown as typeof fetch;
(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => (k === 'SOLAR_API_KEY' ? 'test' : undefined) } };
const user = { id: '00000000-0000-0000-0000-000000000001' };
let res = await handleIsekai3dQuestion(fakeDb({ consent: false, memory: true, pending: 0 }) as never, writer as never, user, request(), ai, () => 0.9);
ok(res.status === 403 && (await res.json()).code === 'CONSENT_REQUIRED' && sent === null, '동의 안 한 학생은 AI 를 부르지 않음');
res = await handleIsekai3dQuestion(fakeDb({ consent: true, memory: true, pending: 2 }) as never, writer as never, user, request(), ai, () => 0.9);
ok((await res.json()).status === 'pending_exists' && sent === null, '대기열이 남았으면 만들지 않음');
res = await handleIsekai3dQuestion(fakeDb({ consent: true, memory: false, pending: 0 }) as never, writer as never, user, request(), ai, () => 0.9);
const payload = sent as { insights: string[]; recent: string[] };
ok(res.status === 200 && payload.insights.length === 0 && payload.recent.length === 0, '기억을 끈 학생은 경향 없이');
ok(calls.includes('isekai3d_questions_add:1'), '통과한 카드만 넣음');
ok(stored.p_model === 'solar-pro4' && JSON.stringify(stored.p_context) === JSON.stringify(sent), '만든 AI 와 AI 에 보낸 맥락을 그대로 남김');
const text = JSON.stringify(isekai3dPayload(parseIsekai3dRequest(request({ context: { ...request().context, name: '정시우', answerText: '비밀' } }))));
ok(!text.includes('정시우') && !text.includes('비밀'), '요청에 끼워 넣은 이름·글은 모델에게 가지 않음');
ok(isekai3dSystemPrompt('life').includes('건너뛸') && isekai3dSystemPrompt('explore').includes('결론 내리지'), '성찰·진로 프롬프트 규칙');

console.log('⑥ SQL 권한');
const sql = readFileSync(resolve(root, 'supabase/migrations/20261019213117_isekai3d_questions.sql'), 'utf8');
const granted = [...sql.matchAll(/grant execute on function (public\.isekai3d_\w+)\(([^)]*)\) to authenticated/g)].map((m) => `${m[1]}(${m[2]})`);
ok(granted.length === 9, '학생·교사가 부르는 RPC 9개 (시험 초기화 포함)');
ok(/isekai3d_dev_reset[\s\S]*?role = 'admin'[\s\S]*?raise exception/.test(sql), '시험 초기화는 관리자만');
ok(granted.every((g) => sql.includes(`revoke execute on function ${g} from public, anon;`)), '그 RPC 는 모두 anon·PUBLIC 회수');
ok(!/isekai3d_questions_add\([^)]*\) to authenticated/.test(sql) && /isekai3d_questions_add\([^)]*\) from public, anon, authenticated/.test(sql), '쓰기 함수는 service_role 만');
ok(/revoke all on public\.isekai3d_player from public, anon, authenticated/.test(sql) && /revoke all on public\.isekai3d_questions from public, anon, authenticated/.test(sql), '표는 직접 접근 불가');
ok((sql.match(/security definer set search_path = ''/g) ?? []).length >= 10, 'DEFINER 함수는 search_path 고정');
ok(/at time zone 'Asia\/Seoul'/.test(sql) && /pg_advisory_xact_lock/.test(sql), '하루는 한국 시간, 동시에 불러도 하루 1개');
const canView = sql.slice(sql.indexOf('function public.isekai3d_can_view'), sql.indexOf('end $$;', sql.indexOf('function public.isekai3d_can_view')));
ok(canView.includes('학년부장') && !/is_teacher_or_admin/.test(canView), '첫 열람 판정은 담임·학년부장 태그');

console.log('⑦ 관리자 열람 (2026-10-22 정책 변경)');
const adminView = readFileSync(resolve(root, 'supabase/migrations/20261022120000_isekai3d_admin_view_answers.sql'), 'utf8');
const canView2 = adminView.slice(adminView.indexOf('function public.isekai3d_can_view'), adminView.indexOf('end $$;', adminView.indexOf('function public.isekai3d_can_view')));
ok(/role = 'admin'\) then return true/.test(canView2) && canView2.includes('학년부장') && canView2.includes("'학년' || c::text || '반'"),'관리자 + 담임·학년부장 (태그 판정은 그대로)');
ok(/if g is null then return false;[\s\S]*role = 'admin'/.test(canView2), '관리자도 재학생만 (학생 아닌 계정은 판정 전에 거름)');
ok(/revoke execute on function public\.isekai3d_can_view\(uuid\) from public, anon, authenticated/.test(adminView), '판정 함수는 여전히 직접 못 부름');
ok(/'contextKey', context_key/.test(adminView), '답 목록에 맥락 키');
ok(cardText('{n:은/는} 회진을 따라가요. {n}의 선배') === '심은 회진을 따라가요. 심의 선배', '카드 글의 심 이름 자리');
ok(contextLabel('career:doctor:4', { doctor: '의사' }) === '의사 · 5단계' && contextLabel('life:firstJob', {}) === '처음으로 일을 시작함' && contextLabel('explore', {}) === null, '맥락 키 이름');
ok(chosenLabel({ card: { options: ['가', '나'] }, choice: 1 }) === '나' && chosenLabel({ card: { options: ['가'] }, choice: 3 }) === null, '고른 보기 (범위 밖은 null)');
ok(answerState({ answeredAt: null, choice: null, text: null }) === 'open' && answerState({ answeredAt: 'x', choice: null, text: null }) === 'skipped' && answerState({ answeredAt: 'x', choice: 0, text: null }) === 'answered', '답 상태');
const viewSrc = readFileSync(resolve(root, 'src/components/admin/Isekai3dAdmin.tsx'), 'utf8');
ok(!viewSrc.includes('본인·담임·학년부장만 볼 수 있어 여기에는 개수만'), '옛 안내(«관리자는 못 봄») 문구가 되살아나지 않음');

const catalog = readFileSync(resolve(root, 'supabase/migrations/20261019224510_isekai3d_question_catalog.sql'), 'utf8');
ok(/career_id text generated always/.test(catalog) && /career_level integer generated always/.test(catalog) && /life_event text generated always/.test(catalog), '직업·단계·사건은 나눔 칸으로');
ok(/drop function public\.isekai3d_dev_reset\(\)/.test(catalog) && !/delete from public\.isekai3d_questions/.test(catalog), '질문은 지우지 않는다');
ok(/isekai3d_questions_add\(uuid, text, text, jsonb, text, jsonb\) from public, anon, authenticated/.test(catalog), '새 넣기 함수도 service_role 만');

// ⑦ 동전 하나로 하는 시간 = 관리자 설정(2026-10-23) — 숫자가 함수 본문에 되살아나면 설정이 조용히 무시된다
const perCoin = readFileSync(resolve(root, 'supabase/migrations/20261023130000_isekai3d_per_coin_setting.sql'), 'utf8');
ok(/select economy_private\.num\('isekai3d\.per_coin'\), economy_private\.num\('isekai3d\.max_coins'\), economy_private\.num\('isekai3d\.coin_price'\)/.test(perCoin)
  && !/select 1440,/.test(perCoin), '동전 하나의 시간은 코인 경제 설정에서(1440 상수 아님)');
ok(/\('isekai3d\.per_coin', 'isekai3d', 'limit', '[^']+', '[^']+', '분', 1440, 1440, 60, 10080,/.test(perCoin), '설정 시드 — 기본 1440(지금과 같다) · 게임 1시간~7일');
ok(realPlayLabel(1440) === '실제로 보통 속도 약 12분 · 빠르게 약 4분' && realPlayLabel(60) === '실제로 보통 속도 약 30초 · 빠르게 약 10초', '실제 시간 환산(보통 0.5초 · 빠르게 1/6초)');
ok(ISEKAI3D_PLAY_KEYS.perCoin === 'isekai3d.per_coin' && viewSrc.includes('<Isekai3dPlaySettings />') && viewSrc.includes('gameTimeLabel(s.rule.per_coin)'), '이세계 탭 — 동전 설정 카드 · 통계 문구가 설정을 따른다');
const settingsSrc = readFileSync(resolve(root, 'src/components/admin/Isekai3dPlaySettings.tsx'), 'utf8');
ok(settingsSrc.includes("rpc('admin_coin_economy_set'") && settingsSrc.includes('COIN_ECONOMY_QUERY_KEY'), '저장은 코인 경제와 같은 RPC(범위·기록을 서버가 본다)');

// ⑧ 과제 카드 · 이어지는 질문 · 하나씩 (2026-10-25 요청)
console.log('⑧ 과제 카드 · 이어지는 질문 · 하나씩');
const task = {
  type: 'task',
  text: '{n:이/가} 일하는 게임 회사에서 외계 생명체와 인류가 싸우는 RTS 게임을 만들고 있어요. 오늘은 전투에 들어갈 새 기능을 맡았어요.',
  ask: '어떤 기능을 넣으면 전투가 더 재미있어질까요?',
  hints: ['전투에서 플레이어가 가장 신나는 순간은 언제일까요?', '외계 생명체만의 특별한 점을 살릴 수 있을까요?'],
  example: '예를 들어, 외계 생명체가 쓰러진 자리에 잠깐 독 웅덩이가 생겨 인류가 돌아가야 하게 만들 수 있어요.',
};
ok(ISEKAI3D_BATCH === 1, '근무 질문은 한 번에 하나씩');
ok(checkTaskCard(task, ctx)?.hints.length === 2, '과제 카드: 상황·질문·힌트 2개·예시면 통과');
ok(checkTaskCard({ ...task, hints: ['하나만'] }, ctx) === null, '힌트가 하나면 거절');
ok(checkTaskCard({ ...task, example: '' }, ctx) === null, '예시가 없으면 거절');
ok(checkTaskCard({ ...task, text: '{n:이/가} 오늘 데이트 앱의 새 기능을 만들어야 해요. 사용자가 좋아할 기능은 무엇일까요?' }, ctx) === null, '금칙어(데이트)는 거절');
ok(checkIsekai3dCards({ cards: [task] }, parseIsekai3dRequest(request()), { task: true })[0]?.hasOwnProperty('ask') && checkIsekai3dCards({ cards: [task] }, parseIsekai3dRequest(request())).length === 0, '과제 카드는 과제 카드를 청할 때만 지난다');
ok(isekai3dSystemPrompt('career', { task: true }).includes('RTS') && isekai3dSystemPrompt('career', { task: true }).includes('hints'), '과제 카드 프롬프트: 구체적인 일 · 힌트');
const withFollow = parseIsekai3dRequest(request({ context: { ...request().context, follow: { text: '선배가 자료를 부탁했어요.', answer: '함께 하자고 했다' } } }));
ok(withFollow.context.follow?.answer === '함께 하자고 했다' && JSON.stringify(isekai3dPayload(withFollow)).includes('함께 하자고 했다'), '이어지는 질문: 앞 상황과 답이 모델에게 간다');
ok(parseIsekai3dRequest(request()).context.follow === undefined && !JSON.stringify(isekai3dPayload(parseIsekai3dRequest(request()))).includes('follow'), '이어지지 않는 질문에는 앞 답이 없다');
ok(isekai3dSystemPrompt('career', { follow: true }).includes('다음 국면') && !isekai3dSystemPrompt('career').includes('다음 국면'), '이어지는 질문일 때만 이어 쓰라고 한다');
let system = '';
const aiTask = (async (_u: string, init: RequestInit) => {
  system = JSON.parse(String(init.body)).messages[0].content;
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ cards: [task] }) } }] }));
}) as unknown as typeof fetch;
res = await handleIsekai3dQuestion(fakeDb({ consent: true, memory: true, pending: 0 }) as never, writer as never, user, request(), aiTask, () => 0.1);
ok(res.status === 200 && system.includes('근무 과제 카드') && calls.at(-1) === 'isekai3d_questions_add:1', '주사위가 낮으면 과제 카드를 만들어 하나 넣는다');
res = await handleIsekai3dQuestion(fakeDb({ consent: true, memory: true, pending: 0 }) as never, writer as never, user, request(), aiTask, () => 0.9);
ok(res.status === 502 && !system.includes('근무 과제 카드'), '주사위가 높으면 보통 카드를 청하고, 과제 카드가 오면 떨어뜨린다');

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
