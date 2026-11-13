// 활동 기록 AI 초안 — 실 LLM 검증 (선택 실행)
// 실행: npx tsx scripts/creative-activities-test/run-draft-live.mts
//
// 순수 로직 회귀(run.mts)는 "우리 파서가 옳게 동작하는가"를 보고,
// 이 스크립트는 "**모델이 실제로 이 형식을 지키는가**"를 본다 — 이 기능의 성패가 거기 있다.
// 키는 .env.local의 SOLAR_API_KEY(없으면 UPSTAGE_API_KEY).

import { readFileSync, existsSync } from 'node:fs';
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  findMissingRequired,
  isDraftReady,
  parseDraftResponse,
} from '../../src/features/creative-activities/utils/activityDraft';

function envValue(key: string): string | null {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\s*${key}\s*=\s*(.+)\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  }
  return null;
}

const KEY = envValue('SOLAR_API_KEY') ?? envValue('UPSTAGE_API_KEY');
if (!KEY) {
  console.log('SOLAR_API_KEY가 없습니다 — 실 LLM 검증을 건너뜁니다.');
  process.exit(0);
}

// 앱 기본값(`SOLAR_CHAT_MODEL`)과 짝을 맞춘다 — 실사용과 다른 모델로 검증하면
// 통과해도 아무것도 보장하지 못한다. (2026-09-21 pro3 → pro4)
const MODEL = process.env.MODEL ?? 'solar-pro4';
const TODAY = '2026-08-28';
const YEAR = 2026;

async function chat(turns: string[]): Promise<string> {
  const res = await fetch('https://api.upstage.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildDraftSystemPrompt(TODAY, YEAR) },
        { role: 'user', content: buildDraftUserPrompt(turns) },
      ],
      temperature: 0.2,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  return json.choices?.[0]?.message?.content ?? '';
}

let pass = 0, fail = 0;
function check(cond: boolean, name: string, detail = '') {
  if (cond) { console.log('  ✓', name, detail); pass++; }
  else { console.error('  ✗', name, detail); fail++; }
}

// ── 케이스 1: 날짜가 없는 설명 → 되물어야 한다 ──
console.log(`\n[모델 ${MODEL}] 케이스 1 — 날짜 없음`);
{
  const T1 = '방송부에서 라디오 대본 쓰는 실습을 했어요. 방송실에서 했습니다.';
  const raw = await chat([T1]);
  const r = parseDraftResponse(raw, [T1]);
  check(!!r.draft.name, '활동 이름 추출', `→ ${r.draft.name ?? '(없음)'}`);
  check(r.draft.areaGroup === 'club', '영역=동아리 판정', `→ ${r.draft.areaGroup}`);
  check(r.draft.startsOn === undefined, '없는 날짜를 지어내지 않음');
  check(r.questions.length > 0, '되묻는다', `→ ${r.questions[0] ?? ''}`);
  check(findMissingRequired(r.draft).includes('startsOn'), '결손 항목에 날짜 포함');

  // ── 케이스 2: 답변을 주면 완성되어야 한다 ──
  console.log('\n케이스 2 — 답변 후 완성');
  const T2 = [T1, '2026년 8월 21일에 했습니다.'];
  const raw2 = await chat(T2);
  const r2 = parseDraftResponse(raw2, T2);
  check(r2.draft.startsOn === '2026-08-21', '날짜 반영', `→ ${r2.draft.startsOn}`);
  check(isDraftReady(r2.draft), '초안 완성', `결손 ${findMissingRequired(r2.draft).join(',') || '없음'}`);
  check(r2.questions.length === 0, '완성되면 더 묻지 않는다');
}

// ── 케이스 3: 사람 이름을 넣어도 초안에 이름이 들어가지 않아야 한다 ──
console.log('\n케이스 3 — 사람 이름 유출 금지');
{
  const T3 = '2026-08-20에 윤하준 선생님이 인솔해서 정이안, 송수아 학생이 전북과학교육원에서 진로 체험을 했습니다.';
  const raw = await chat([T3]);
  const r = parseDraftResponse(raw, [T3]);
  const blob = JSON.stringify(r.draft);
  check(!blob.includes('정이안') && !blob.includes('송수아'), '학생 이름이 초안에 없다');
  check(!blob.includes('윤하준'), '교사 이름이 초안에 없다');
  check(r.draft.startsOn === '2026-08-20', '날짜 파싱', `→ ${r.draft.startsOn}`);
}

// ── 케이스 4: 상대 날짜 해석 ──
console.log('\n케이스 4 — 상대 날짜');
{
  const T4 = '어제 도서부에서 신간 큐레이션 코너를 만들었습니다.';
  const raw = await chat([T4]);
  const r = parseDraftResponse(raw, [T4]);
  check(r.draft.startsOn === '2026-08-27' || r.questions.length > 0,
    '어제를 계산하거나 되묻는다(지어내지 않음)', `→ ${r.draft.startsOn ?? r.questions[0]}`);
}

console.log(`\n통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail > 0 ? 1 : 0);
