/**
 * 과제 카드·이어지는 질문을 Solar 로 실제 한 번씩 (2026-10-25) — `npx tsx scripts/isekai3d-question-test/live-task.mts`
 * 프롬프트가 검사를 지나는 카드를 실제로 만드는지 본다. 비용이 드니 회귀(run.mts)와 따로.
 */
import { readFileSync } from 'node:fs';
import { handleIsekai3dQuestion } from '../../supabase/functions/isekai3d-question/handler.ts';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]));
(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => env[k] } };
const career = {
  id: 'gameDeveloper', label: '게임 개발자', level: 3, levelLabel: '게임 프로그래머', dailyPay: 180,
  skills: [{ key: 'programming', label: '코딩' }, { key: 'creativity', label: '창의력' }],
  rung: '4/10', stage: { key: 'expert', label: '전문', desc: '갈래의 전문 업무를 스스로 판단해요' }, stageWork: ['게임 기능 만들기', '버그 고치기', '플레이 테스트'],
};
const request = (follow?: { text: string; answer: string }) => ({
  kind: 'career', contextKey: 'career:gameDeveloper:3',
  context: { career, commonSkills: [{ key: 'empathy', label: '공감' }], moods: [{ key: 'focused', label: '집중' }], dweller: { traits: ['창의적'], emotion: '집중', age: '어른' }, insights: [], recent: [], avoid: [], ...(follow ? { follow } : {}) },
});
const db = { rpc: async () => ({ data: { consent: true, memory: true, pending: 0 }, error: null }) } as never;
let failed = 0;
for (const [name, dice, follow] of [
  ['과제 카드', 0.1, undefined],
  ['이어지는 보통 카드', 0.9, { text: '{n:이/가} 맡은 몬스터 길찾기에 버그가 있어 출시가 늦어질 수 있어요.', answer: '팀장에게 바로 알리고 함께 우선순위를 다시 정했다' }],
] as const) {
  let card: unknown = null;
  const writer = { rpc: async (_n: string, a: { p_cards: unknown[] }) => ((card = a.p_cards[0]), { data: { status: 'filled', count: 1 }, error: null }) } as never;
  const t0 = Date.now();
  const res = await handleIsekai3dQuestion(db, writer, { id: 'u' }, request(follow), fetch, () => dice);
  console.log(`${name}: ${res.status} (${Math.round((Date.now() - t0) / 1000)}초)`);
  console.log(JSON.stringify(card, null, 1));
  if (res.status !== 200) failed++;
}
process.exit(failed ? 1 : 0);
