/**
 * 이세계 사회인 직장 에피소드 회귀 — `npx tsx scripts/isekai3d-episode-test/run.mts` (LIVE=1 이면 OpenAI gpt-6-luna 로 실제 한 번)
 *
 * 조용히 틀리는 자리를 못 박는다:
 *  ① 요청: 이상한 캐릭터 키·직업·사람 없는 요청을 받는다
 *  ② 검사: 줄거리에 없는 사람이 말하거나, 결과 범위를 넘거나, 금칙어(연애 등)가 들어간 장면이 통과한다
 *  ③ 처리: 동의 안 한 학생·받을 장면이 남은 학생·한도 넘은 학생에게 AI 를 부른다(비용), 새 시즌/다음 장면이 바뀐다
 *  ④ 보내는 것: 스타의 persona 가 빠지거나, 지난 결정(직접 쓴 글)이 다음 장면에 안 간다
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOutline, checkScene, dropGlossed, episodePayload, episodeSystemPrompt, parseEpisodeRequest } from '../../supabase/functions/_shared/isekai3dEpisode.ts';
import { handleIsekai3dEpisode } from '../../supabase/functions/isekai3d-episode/handler.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let failed = 0;
const ok = (cond: unknown, name: string) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`); }
};
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

const request = (over: Record<string, unknown> = {}) => ({
  gameKey: 'abcd1234:1',
  career: { id: 'doctor', label: '의사', levelLabel: '레지던트', stage: '입문', work: ['회진 따라가며 기록하기'], dailyPay: 200 },
  dweller: { traits: ['친절함'], emotion: 'focused', gender: 'female' },
  cast: [
    { id: 801, name: '김지훈', role: '과장', gender: 'male', traits: ['완벽주의'] },
    { id: 4902, name: '서이안', role: '외과 전문의', gender: 'male', traits: ['천재'], persona: '대학병원 최연소 외과 전문의. 차갑지만 다정해요.' },
  ],
  ...over,
});
const req = parseEpisodeRequest(request());
const outline = {
  title: '새벽 응급실의 비밀', genre: '성장 드라마', logline: '실수를 숨긴 사람을 찾아가는 밤샘 근무 이야기',
  cast: [{ key: 'c801', role: '과장' }, { key: 'c4902', role: '외과 전문의' }, { key: 'n1', name: '박하늘', role: '신입 간호사', gender: 'female' }],
  beats: ['이상한 기록을 발견한다', '서이안과 부딪친다', '진실을 밝힌다'], ending: '팀이 서로를 믿게 된다',
};
const scene = {
  title: '지워진 기록', place: '응급실 접수대',
  lines: [
    { who: 'narration', text: '새벽 두 시, 응급실이 잠깐 조용해졌어요.' },
    { who: 'c4902', text: '{n}, 이 기록 누가 고쳤는지 알아요?' },
    { who: 'c801', text: '지금은 환자부터 봐야 할 때야.' },
    { who: 'n1', text: '저… 제가 실수한 것 같아요.' },
  ],
  question: '{n:은/는} 어떻게 할까요?',
  choices: [
    { text: '박하늘을 감싸 준다', effects: { perf: -3, friend: { n1: 12, c4902: -5 }, mood: 'confident' } },
    { text: '서이안에게 사실대로 말한다', effects: { perf: 6, friend: { c4902: 8, n1: -6 }, mood: 'stressed', money: 9999 } },
  ],
  free: { effects: { perf: 2 } },
  final: false,
};

console.log('① 요청');
ok(throws(() => parseEpisodeRequest(request({ gameKey: 'Bad Key' }))), '이상한 캐릭터 키는 거절');
ok(throws(() => parseEpisodeRequest(request({ cast: [] }))), '직장 사람이 없으면 거절');
ok(req.cast[1].persona?.includes('외과') && !('persona' in req.cast[0]), '스타만 persona 를 가진다');

console.log('② 검사');
const o = checkOutline(outline, req);
ok(o && o.cast.length === 3 && o.cast[0].name === '김지훈' && o.cast[2].new, '줄거리: 직장 사람 이름은 게임 것, 새 인물은 new');
ok(checkOutline({ ...outline, cast: [{ key: 'c999' }, { key: 'n1', name: '박하늘', gender: 'female' }] }, req) === null, '모르는 직장 사람(c999)만 있으면 거절');
ok(checkOutline({ ...outline, beats: ['하나'] }, req) === null, '장면 줄기가 셋이 안 되면 거절');
const s = o && checkScene(scene, o, req, false);
ok(s && s.choices[1].effects.money === 100, '돈은 일당의 0.5배로 묶는다');
ok(s && s.choices[0].effects.friend?.n1 === 12, '등장인물과의 우정이 남는다');
ok(o && checkScene({ ...scene, lines: [...scene.lines, { who: 'c123', text: '누구세요?' }] }, o, req, false) === null, '줄거리에 없는 사람의 대사는 거절');
ok(o && checkScene({ ...scene, lines: scene.lines.map((l, i) => (i === 1 ? { ...l, text: '오늘 데이트 어때요?' } : l)) }, o, req, false) === null, '금칙어(데이트)는 거절');
ok(o && checkScene({ ...scene, choices: [scene.choices[0]] }, o, req, false) === null, '선택지가 둘이 아니면 거절');
ok(dropGlossed('Vital sign(활력징후) 숫자만 옮겨요') === '활력징후 숫자만 옮겨요' && dropGlossed('활력징후(vital sign)를 봐요') === '활력징후를 봐요', '영어에 한글 풀이가 붙어 있으면 한글만 남긴다');
ok(o && checkScene({ ...scene, question: '심정이는 어떻게 할까요?' }, o, req, false) === null, '결정 글에 {n} 이 없으면(심에게 이름을 지어 붙이면) 거절');
ok(o && checkScene({ ...scene, lines: scene.lines.map((l, i) => (i === 0 ? { ...l, text: '당신 손끝이 떨려요.' } : l)) }, o, req, false) === null, '설명에서 심을 «당신»이라 부르면 거절');
ok(/star: true/.test(episodeSystemPrompt('season')) && JSON.stringify(episodePayload(req, {})).includes('"star":true'), '스타는 주인공급으로 넣으라고 하고, 모델에게 간다');

console.log('③ 처리 (가짜 DB·AI)');
const reply = (body: unknown) => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] }) });
const fakeDb = (status: Record<string, unknown>) => ({ rpc: async () => ({ data: status, error: null }) }) as never;
const added: Record<string, unknown>[] = [];
const writer = { rpc: async (_n: string, args: Record<string, unknown>) => (added.push(args), { data: { status: 'added', idx: 0 }, error: null }) } as never;
let calls = 0;
const ai = (async () => (calls++, reply({ outline, scene }))) as unknown as typeof fetch;
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => 'key' } };
const base = { consent: true, dev: false, generatedToday: 0, season: null, pastTitles: ['지난 시즌'] };
let r = await handleIsekai3dEpisode(fakeDb({ ...base, consent: false }), writer, { id: 'u' }, request(), ai);
ok(r.status === 403 && calls === 0, '동의 안 한 학생에게는 AI 를 부르지 않는다');
r = await handleIsekai3dEpisode(fakeDb({ ...base, generatedToday: 3 }), writer, { id: 'u' }, request(), ai);
ok(r.status === 429 && calls === 0, '하루 세 번을 넘으면 부르지 않는다');
const season = { id: 'e1', outline: o, scenes: [{ id: 's0', idx: 0, scene: s, delivered: true, answered: false, choice: null, text: null }] };
r = await handleIsekai3dEpisode(fakeDb({ ...base, season }), writer, { id: 'u' }, request(), ai);
ok((await r.json()).status === 'waiting' && calls === 0, '받은 장면의 결정을 기다리면 쓰지 않는다');
r = await handleIsekai3dEpisode(fakeDb(base), writer, { id: 'u' }, request(), ai);
ok(r.status === 200 && calls === 1 && added.at(-1)?.p_outline && added.at(-1)?.p_scene, '새 시즌: 줄거리와 첫 장면을 남긴다');
const answered = { ...season, scenes: [{ ...season.scenes[0], answered: true, text: '박하늘과 함께 과장님께 말한다' }] };
let sent = '';
const ai2 = (async (_u: string, init: { body: string }) => ((sent = init.body), calls++, reply({ scene: { ...scene, final: true } }))) as unknown as typeof fetch;
r = await handleIsekai3dEpisode(fakeDb({ ...base, season: answered }), writer, { id: 'u' }, request(), ai2);
ok(r.status === 200 && added.at(-1)?.p_outline === null, '다음 장면: 진행 중 시즌에 이어 남긴다');
ok(sent.includes('박하늘과 함께 과장님께 말한다'), '직접 쓴 결정이 다음 장면을 쓰는 데 간다');
ok((added.at(-1)?.p_scene as { final?: boolean })?.final === false, '마지막 여부는 서버가 줄기 수로 정한다(두 번째 장면은 아직)');

console.log('④ SQL');
const sql = readFileSync(resolve(root, 'supabase/migrations/20261025230000_isekai3d_episodes.sql'), 'utf8');
ok(/revoke execute on function public\.isekai3d_episode_add[\s\S]*from public, anon, authenticated/.test(sql), '쓰기 함수는 학생이 부를 수 없다');
ok(/revoke all on public\.isekai3d_episode_scenes from public, anon, authenticated/.test(sql), '표 직접 접근 없음');
ok(/>= 2 then\s+return jsonb_build_object\('status', 'daily_done'\)/.test(sql), '받기는 하루 2개');

if (process.env.LIVE) {
  console.log('⑤ OpenAI gpt-6-luna 로 실제 한 번');
  const env = Object.fromEntries(readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]));
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] } };
  const live: Record<string, unknown>[] = [];
  const liveWriter = { rpc: async (_n: string, args: Record<string, unknown>) => (live.push(args), { data: { status: 'added', idx: 0 }, error: null }) } as never;
  const t0 = Date.now();
  r = await handleIsekai3dEpisode(fakeDb(base), liveWriter, { id: 'u' }, request(), fetch);
  const body = await r.json();
  console.log(`    ${r.status} ${JSON.stringify(body)} (${Math.round((Date.now() - t0) / 1000)}초)`);
  if (live[0]) console.log(JSON.stringify({ outline: live[0].p_outline, scene: live[0].p_scene }, null, 1));
  ok(r.status === 200, '실제 모델의 줄거리·첫 장면이 검사를 통과');
  if (live[0]) {
    // 다음 장면: 플레이어가 직접 쓴 결정을 이어서 (2026-10-26 실제 게임에서 502 가 났던 자리)
    const went = { id: 'e1', outline: live[0].p_outline, scenes: [{ id: 's0', idx: 0, scene: live[0].p_scene, delivered: true, answered: true, choice: null, text: '일단 환자 곁을 지키면서 선배에게 조용히 도움을 청한다' }] };
    const t1 = Date.now();
    r = await handleIsekai3dEpisode(fakeDb({ ...base, season: went }), liveWriter, { id: 'u' }, request(), fetch);
    console.log(`    ${r.status} ${JSON.stringify(await r.json())} (${Math.round((Date.now() - t1) / 1000)}초)`);
    if (live[1]) console.log(JSON.stringify(live[1].p_scene, null, 1));
    ok(r.status === 200, '실제 모델의 다음 장면이 검사를 통과');
  }
}

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
