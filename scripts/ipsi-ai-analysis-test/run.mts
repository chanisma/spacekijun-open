// 입시 정보 AI 분석 — 순수 로직 회귀
// 실행: npx tsx scripts/ipsi-ai-analysis-test/run.mts
//
// **이 회귀가 유일한 방어선인 이유**: 실패 입력은 모델이 만든다. 우리는 그것을
// 재현할 수 없고, 잘못 파싱해도 예외가 아니라 **그럴듯한 부분 결과**가 나온다
// (잘린 배열을 조용히 버리거나 반쪽 문장을 결과로 싣는다). 그래서 모델이 낼 수 있는
// 망가진 응답 모양을 여기에 표본으로 못 박는다.

import {
  AnalysisParseError,
  closeOpenStructures,
  collectCutPoints,
  findObjectSpan,
  parseAnalysisJson,
  repairTruncatedJson,
  stripReasoningBlocks,
  unwrapCodeFence,
} from '../../src/features/ipsi-hub/utils/analysisJson';
import {
  ANALYSIS_PERSPECTIVE_PRESETS,
  perspectivePresetsFor,
  defaultPerspectiveFor,
  isPerspectivePreset,
} from '../../src/features/ipsi-hub/types/aiAnalysis';

// 서비스는 supabase 클라이언트를 끌고 오고 그 모듈이 부팅 시 localStorage를 만진다.
// 다른 회귀(`evalearn-store-test`)와 같은 방식으로 stub 후 동적 import한다.
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
const {
  buildAnalysisSystemPrompt,
  hasUsableAnalysis,
  normalizeResult,
  JSON_ONLY_REINFORCEMENT,
  ANALYSIS_MAX_TOKENS,
  ANALYSIS_TEMPERATURE,
  ANALYSIS_RETRY_TEMPERATURE,
  ANALYSIS_MAX_ATTEMPTS,
  ANALYSIS_PROVIDER,
  ANALYSIS_MODEL,
} = await import('../../src/features/ipsi-hub/services/newsAiAnalysisService');
const { OPENAI_CHAT_MODEL } = await import('../../src/services/aiChat');

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

const FULL = {
  summary: '네 기사를 종합하면 수시 비중이 늘고 있다.',
  keyFindings: ['발견 1', '발견 2'],
  trends: ['추세 1'],
  strategy: ['전략 1'],
  cautions: ['유의 1'],
};
const FULL_JSON = JSON.stringify(FULL);

// ══════════════════════════════════════════
console.log('\n[정상 응답]');
// ══════════════════════════════════════════

ok(
  (parseAnalysisJson(FULL_JSON).value as any).summary === FULL.summary,
  '순수 JSON 그대로'
);
ok(parseAnalysisJson(FULL_JSON).repaired === false, '정상 응답은 복구 표시가 붙지 않는다');
ok(
  (parseAnalysisJson('```json\n' + FULL_JSON + '\n```').value as any).trends.length === 1,
  '코드펜스로 감싼 응답'
);
ok(
  (parseAnalysisJson('다음은 분석 결과입니다.\n' + FULL_JSON + '\n이상입니다.').value as any)
    .keyFindings.length === 2,
  '앞뒤 잡담이 붙은 응답'
);

// 종전 구현이 조용히 틀리던 자리 — 객체 뒤에 중괄호를 포함한 잡담이 오면
// lastIndexOf가 그 괄호를 집어 파싱이 깨졌다.
ok(
  (parseAnalysisJson(FULL_JSON + '\n\n참고: {추가 메모}').value as any).summary === FULL.summary,
  '객체 뒤 텍스트에 중괄호가 있어도 첫 객체만 집는다'
);

ok(
  (parseAnalysisJson('<think>어떻게 답할까 {계획}</think>\n' + FULL_JSON).value as any).trends[0] ===
    '추세 1',
  '사고 블록을 벗긴다 — 그 안의 괄호를 JSON 시작으로 착각하지 않는다'
);

// ══════════════════════════════════════════
console.log('\n[잘린 응답 — 복구]');
// ══════════════════════════════════════════

// 실제 실패 모양: 배열 원소 문자열 한가운데서 예산이 끝난다
const cutMidString =
  '{"summary":"수시 비중이 늘고 있다.","keyFindings":["발견 1","발견 2","발견 3은 여기서 잘렸';
const midStringResult = parseAnalysisJson(cutMidString);
ok(midStringResult.repaired === true, '문자열 한가운데 잘림 → 복구로 표시');
ok(
  (midStringResult.value as any).summary === '수시 비중이 늘고 있다.',
  '복구해도 도착한 summary는 살린다'
);
ok(
  (midStringResult.value as any).keyFindings.length === 2,
  '잘린 원소는 버린다 — 반쪽 문장을 결과에 싣지 않는다'
);
ok(
  !JSON.stringify(midStringResult.value).includes('여기서 잘렸'),
  '잘린 문장의 잔해가 남지 않는다'
);

// 닫는 괄호 직후에서 끝난 경우
const cutAfterArray = '{"summary":"총평","keyFindings":["a","b"],"trends":[';
ok(
  (parseAnalysisJson(cutAfterArray).value as any).keyFindings.length === 2,
  '빈 배열을 열자마자 잘림 → 앞 항목 유지'
);

// 키만 적고 끝난 경우
ok(
  (parseAnalysisJson('{"summary":"총평","trends"').value as any).summary === '총평',
  '값 없는 키만 남으면 그 키를 버린다'
);
ok(
  (parseAnalysisJson('{"summary":"총평","trends":').value as any).summary === '총평',
  '콜론까지만 온 경우'
);

// 코드펜스가 열리고 닫히지 않은 채 잘린 경우 (가장 흔한 조합)
const fencedCut = '```json\n{"summary":"총평","trends":["추세 1","추세 2"';
ok(
  (parseAnalysisJson(fencedCut).value as any).trends.length === 2,
  '닫히지 않은 코드펜스 + 잘린 JSON'
);

// 중첩 객체가 잘린 경우
const nestedCut = '{"summary":"총평","meta":{"model":"solar-pro3","tokens":';
ok(
  (parseAnalysisJson(nestedCut).value as any).summary === '총평',
  '중첩 객체 안에서 잘림'
);

// 이스케이프된 따옴표가 있는 문자열 — 스캔이 문자열 종료를 오판하면 안 된다
const escaped = '{"summary":"모델이 \\"수시\\" 라 불렀다","trends":["a"]}';
ok(
  (parseAnalysisJson(escaped).value as any).summary.includes('"수시"'),
  '이스케이프된 따옴표를 문자열 끝으로 오판하지 않는다'
);
const escapedCut = '{"summary":"모델이 \\"수시\\" 라 불렀다","trends":["a","b';
ok(
  (parseAnalysisJson(escapedCut).value as any).trends.length === 1,
  '이스케이프 포함 문자열 뒤에서 잘림'
);
// 잘린 지점이 백슬래시 한 개로 끝나는 경우(이스케이프 시작만 도착)
ok(
  (parseAnalysisJson('{"summary":"총평","trends":["a","b\\').value as any).trends.length === 1,
  '역슬래시 하나만 도착한 채 잘림'
);

// ══════════════════════════════════════════
console.log('\n[복구 불가 — 원인을 구분해 던진다]');
// ══════════════════════════════════════════

function reasonOf(raw: string): string {
  try {
    parseAnalysisJson(raw);
    return 'parsed';
  } catch (err) {
    return err instanceof AnalysisParseError ? err.reason : 'other';
  }
}

ok(reasonOf('죄송합니다. 요청을 처리할 수 없습니다.') === 'no-json', '산문 응답 → no-json');
ok(reasonOf('<think>한참 생각하다 예산이 끝났다') === 'no-json',
  '추론만 하고 끝난 응답 → no-json (사고 블록 안은 JSON이 아니다)');
ok(reasonOf('{') === 'truncated', '여는 괄호 하나만 → truncated');
ok(reasonOf('{"summary": 그리고 이건 JSON이 아님 :: ') === 'truncated',
  '망가진 값에서 잘림 → truncated');

// 원문을 반드시 들고 나와야 한다 — 화면이 사용자에게 보여 줄 유일한 근거
try {
  parseAnalysisJson('죄송합니다. 처리할 수 없습니다.');
  ok(false, '던져야 한다');
} catch (err) {
  ok(
    err instanceof AnalysisParseError && err.raw === '죄송합니다. 처리할 수 없습니다.',
    '오류가 원문을 싣는다'
  );
  ok(
    err instanceof AnalysisParseError && err.message.includes('JSON 형식'),
    '오류 메시지가 사람이 읽을 수 있다'
  );
}

// ══════════════════════════════════════════
console.log('\n[부품 단위]');
// ══════════════════════════════════════════

ok(findObjectSpan('no braces here') === null, '괄호 없으면 null');
ok(findObjectSpan('xx{"a":1}yy')?.end === 8, '객체 끝 위치');
ok(findObjectSpan('{"a":{"b":1}} 뒤 {메모}')?.end === 12,
  '중첩을 지나 첫 객체의 끝을 집는다');
ok(findObjectSpan('{"a":"}"}')?.end === 8, '문자열 안의 닫는 괄호는 세지 않는다');
ok(findObjectSpan('{"a":1')?.end === null, '닫히지 않으면 end=null');

ok(closeOpenStructures('{"a":[1,2') === '{"a":[1,2]}', '열린 괄호를 역순으로 닫는다');
ok(closeOpenStructures('{"a":1,') === '{"a":1}', '매달린 쉼표 제거');
ok(closeOpenStructures('{"a":') === '{"a": null}', '값 없는 콜론은 null로 채운다');
ok(closeOpenStructures('{"a":"열린 문자열') === null, '문자열 안에서 끝나면 쓰지 않는다');
ok(closeOpenStructures('{"a":1}}') === null, '괄호 짝이 안 맞으면 null');

ok(collectCutPoints('{"a":1,"b":2').includes(6), '쉼표 위치가 후보');
ok(!collectCutPoints('{"a":"1,2').includes(6), '문자열 안 쉼표는 후보가 아니다');
ok(
  !collectCutPoints('{"a":"열린').includes('{"a":"열린'.length),
  '문자열 안에서 끝나면 전체 길이는 후보가 아니다 — 반쪽 문장 방지'
);
ok(
  collectCutPoints('{"a":"열린').length === 0,
  '구조 경계가 하나도 없으면 후보가 없다(→ 복구 불가 = truncated)'
);
ok(
  collectCutPoints('{"a":1,"b":"열린').includes(6),
  '앞에 쉼표가 있으면 그 지점으로 물러날 수 있다'
);
{
  const pts = collectCutPoints('{"a":1,"b":2,"c":3');
  ok(pts[0] > pts[1], '후보는 뒤에서부터(내용을 많이 남기는 순서)');
}

ok(repairTruncatedJson('완전히 JSON이 아님') === null, '복구할 것이 없으면 null');
ok(unwrapCodeFence('```json\n{"a":1}\n```') === '{"a":1}', '닫힌 펜스 벗기기');
ok(unwrapCodeFence('```\n{"a":1') === '{"a":1', '열린 펜스 벗기기');
ok(unwrapCodeFence('{"a":1}') === '{"a":1}', '펜스 없으면 그대로');
ok(stripReasoningBlocks('<think>x</think>후') === '후', '사고 블록 제거');
ok(stripReasoningBlocks('<thinking>x</thinking>후') === '후', 'thinking 태그도 제거');

// ══════════════════════════════════════════
console.log('\n[결과 정규화 · 쓸 수 있는 결과 판정]');
// ══════════════════════════════════════════

// snake_case로 답하는 모델도 있다
{
  const r = normalizeResult({
    summary: ' 총평 ',
    key_findings: ['a'],
    trends: ['b'],
    strategies: ['c'],
    cautions: ['d'],
  });
  ok(r.summary === '총평', 'summary 앞뒤 공백 제거');
  ok(r.keyFindings[0] === 'a', 'key_findings 별칭');
  ok(r.strategy[0] === 'c', 'strategies 별칭');
}
{
  const r = normalizeResult({ keyFindings: ['a', '', '  ', 42, null] });
  ok(r.keyFindings.length === 1, '빈 문자열·비문자열 항목은 버린다');
  ok(r.summary === '', '없는 필드는 빈 값');
}
ok(normalizeResult(null).keyFindings.length === 0, 'null 입력 안전');

// 복구된 결과가 쓸 만한지 — 전부 비었으면 재시도해야 한다
ok(!hasUsableAnalysis(normalizeResult({})), '빈 객체는 쓸 수 없다');
ok(!hasUsableAnalysis(normalizeResult({ summary: '   ' })), '공백뿐인 총평은 쓸 수 없다');
ok(hasUsableAnalysis(normalizeResult({ summary: '총평' })), '총평만 있어도 쓸 수 있다');
ok(
  hasUsableAnalysis(normalizeResult({ trends: ['추세'] })),
  '총평이 없어도 항목이 하나 있으면 쓸 수 있다'
);

// ══════════════════════════════════════════
console.log('\n[프롬프트 — 대상(교사/학생)별]');
// ══════════════════════════════════════════

const teacherPrompt = buildAnalysisSystemPrompt('수시 추세', 'teacher');
const studentPrompt = buildAnalysisSystemPrompt('수시 추세', 'student');

ok(teacherPrompt.includes('진학지도'), '교사 프롬프트는 진학지도 관점');
ok(studentPrompt.includes('학생'), '학생 프롬프트는 학생을 대상으로 말한다');
ok(
  !studentPrompt.includes('학교 현장에서 활용'),
  '학생에게 "학교 현장 활용 전략"을 시키지 않는다 — 그건 교사의 행동이다'
);
ok(
  studentPrompt.includes('본인') || studentPrompt.includes('스스로'),
  '학생 프롬프트는 본인이 할 수 있는 일을 요구한다'
);
ok(
  teacherPrompt.includes('교사가 큐레이션') && studentPrompt.includes('여학교'),
  '학교 맥락은 두 대상 모두에 들어간다'
);
for (const p of [teacherPrompt, studentPrompt]) {
  ok(p.includes('"summary"') && p.includes('"cautions"'), '두 프롬프트 모두 같은 JSON 스키마를 강제');
  ok(p.includes('순수 JSON'), 'JSON만 출력하라는 지시 유지');
}
ok(
  JSON_ONLY_REINFORCEMENT.includes('JSON') && JSON_ONLY_REINFORCEMENT.length < 600,
  '재시도 보강 지시는 짧다 — 길면 그만큼 출력 예산을 먹는다'
);
ok(ANALYSIS_MAX_TOKENS >= 12000, '출력 예산 하한은 다른 Solar 호출부(12000)와 같거나 크다');
// 공급자 기본값이 문서에 없으므로, 지정하는 순간 이 숫자가 곧 천장이 된다.
// 실측 출력(≈1,300토큰) + 최악의 추론 비중(85%)을 덮고도 남는 값이어야 한다.
ok(ANALYSIS_MAX_TOKENS >= 16000, '예산은 실측 출력·추론 비중을 덮고도 남는다 — 원인에서 배제되도록');
ok(ANALYSIS_TEMPERATURE <= 0.5, '구조화된 JSON을 받는 호출이라 온도가 낮다');
ok(
  ANALYSIS_RETRY_TEMPERATURE < ANALYSIS_TEMPERATURE,
  '재시도는 더 결정적으로 — 1차가 형식을 어겼기 때문'
);
ok(ANALYSIS_MAX_ATTEMPTS === 2, '시도는 2회 — 한 번에 30~120초라 그 이상은 기다리지 않는다');

// ⚠️ **공급자가 openai여야 예산이 실제로 전달된다.** `aiChat`은 `maxCompletionTokens`를
// openai 경로에서만 실어 보내고 `solar-proxy`는 `max_tokens`를 아예 보내지 않는다 —
// solar로 되돌리면 위 ANALYSIS_MAX_TOKENS가 조용히 무의미해지고 원래 버그가 재발한다.
ok(ANALYSIS_PROVIDER === 'openai', '공급자는 openai — 여기서만 출력 예산이 전달된다');
ok(ANALYSIS_MODEL === OPENAI_CHAT_MODEL,
  '모델을 명시한다 — 엣지 함수 기본값에 기대면 모델 폐기 때 이 경로만 홀로 죽는다');

// ══════════════════════════════════════════
console.log('\n[분석 관점 — 대상별 프리셋]');
// ══════════════════════════════════════════

const teacherPresets = perspectivePresetsFor('teacher');
const studentPresets = perspectivePresetsFor('student');

ok(teacherPresets.length >= 4, '교사 프리셋이 여러 개');
ok(studentPresets.length >= 3, '학생 프리셋이 여러 개');
ok(
  studentPresets.every(p => p.audience !== 'teacher'),
  '학생에게 교사 전용 관점을 보여 주지 않는다'
);
ok(
  teacherPresets.some(p => p.value === 'teacher_guidance'),
  '교사 기본 관점이 교사 목록에 있다'
);
ok(
  defaultPerspectiveFor('student') === 'student_strategy',
  '학생 기본값은 학생 본인 전략'
);
ok(
  defaultPerspectiveFor('teacher') === 'teacher_guidance',
  '교사 기본값은 기존 그대로'
);
ok(
  studentPresets.some(p => p.value === defaultPerspectiveFor('student')),
  '기본값은 반드시 그 대상의 목록 안에 있다 — 아니면 아무 칩도 선택돼 보이지 않는다'
);
ok(
  teacherPresets.some(p => p.value === defaultPerspectiveFor('teacher')),
  '교사 기본값도 목록 안에 있다'
);
ok(isPerspectivePreset('student_strategy'), '프리셋 값 판정');
ok(!isPerspectivePreset('아무 문자열'), '모르는 값은 프리셋이 아니다');
ok(
  ANALYSIS_PERSPECTIVE_PRESETS.every(p => p.audience === 'both' || p.audience === 'teacher' || p.audience === 'student'),
  '모든 프리셋에 대상이 지정돼 있다'
);

console.log(`\n${pass}건 통과\n`);
