/**
 * 면접 준비 회귀 — `npx tsx scripts/interview-prep-test/run.mts`
 *
 * 이 기능에서 **조용히 틀리는 자리**를 못 박는다. 아래 것들은 하나도 오류를 내지
 * 않는다 — 화면은 멀쩡히 그려지고 값만 틀린다. 그래서 정적 검사가 유일한 방어선이다.
 *
 *  ① 서버와 화면이 **다른 KG 버전**을 고른다 → 학생이 고른 활동을 서버가 못 찾는다
 *  ② 발췌를 `act:<기록id>#<n>` 으로 되찾으면 **엉뚱한 기록**이 붙는다(실측 일치율 37%)
 *  ③ 연습 횟수·버전 상한이 SQL 과 TS 에서 갈라진다 → 화면은 "2개 남음"인데 서버가 거절
 *  ④ 실패한 생성을 이력으로 세면 그 활동이 **영원히 뒤로 밀린다**
 *  ⑤ 커버리지를 질문 수로 세면 한 활동만 열 번 물은 학생이 "열 개 다뤘다"로 보인다
 *  ⑥ 로판 페르소나가 프롬프트에 남는다 → 일반 메뉴에서 갑자기 "그대의 별자리"가 나온다
 *  ⑦ 쓰기 정책이 뚫리거나 `anon` 실행 권한이 남는다
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ANSWER_VERSION_LIMIT,
  COMMON_QUESTION_THEMES,
  FOLLOWUP_MAX_DEPTH,
  INTERVIEW_PREP_DEMO_STUDENT_ID,
  interviewPrepStudentIdFor,
  PRACTICE_DAILY_LIMIT,
  activityCandidatesFromEntities,
  activityExcerpt,
  activitySourceLabel,
  askHistoryOf,
  commonTheme,
  interviewCoverage,
  interviewRubric,
  interviewPrepEvaluatePrompt,
  interviewPrepQuestionPrompt,
  isUsableQuestion,
  koreaDay,
  loadActivityCandidates,
  parseInterviewPrepEvaluation,
  parseInterviewPrepRequest,
  pickCommonTheme,
  pickInterviewActivity,
  rubricAverages,
  type InterviewActivityCandidate,
  type InterviewPrepQuestionRow,
} from '../../supabase/functions/_shared/interviewPrep';
import { koreaDay as academyKoreaDay } from '../../supabase/functions/_shared/academyDaily';
import {
  buildInterviewThreads,
  evaluationsOf,
  flattenThreads,
  groupThreadsByActivity,
  isInFlight,
  latestEvaluatedAnswer,
  speakingLabel,
  weakestCriteria,
} from '../../src/features/interview-prep/utils';
import { commonNavItems, regularNavSections, studentAllowedRoutes, studentNavSections } from '../../src/config/navigation';
import { isPathBlockedForStaff } from '../../src/lib/routeAccess';
import { MANAGED_MENU_BY_KEY } from '../../src/config/menuRegistry';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const MIGRATION = read('supabase/migrations/20260918090000_interview_prep.sql');
const DEMO_MIGRATION = read('supabase/migrations/20260923130000_interview_prep_teacher_demo.sql');
const HANDLER = read('supabase/functions/interview-prep/handler.ts');
const SHARED = read('supabase/functions/_shared/interviewPrep.ts');
const HOOKS = read('src/features/interview-prep/hooks.ts');

const activity = (
  id: string, over: Partial<InterviewActivityCandidate> = {},
): InterviewActivityCandidate => ({
  entityId: id,
  label: `활동 ${id}`,
  grade: 2,
  semester: null,
  subject: '화학Ⅰ',
  category: null,
  sourceActivityIds: [`act:rec-${id}#1`],
  evidence: ['지시약을 메틸오렌지로 바꾸었다'],
  researchQuestion: null,
  level: 3,
  usefulness: 5,
  ...over,
});

// ── 1. 활동 선택: 커버리지 우선 · 결정적 ─────────────────────────────────────
console.log('1. 무엇을 물을지는 코드가 고른다');
{
  const pool = [activity('a'), activity('b'), activity('c')];
  check('후보가 없으면 null', pickInterviewActivity([], undefined, 'seed') === null);

  const history = {
    counts: { a: 2, b: 0, c: 1 },
    lastAskedAt: { a: '2026-09-01T00:00:00Z', c: '2026-09-10T00:00:00Z' },
  };
  check('한 번도 안 물은 활동이 먼저',
    pickInterviewActivity(pool, history, 'seed')?.entityId === 'b');

  const asked = { counts: { a: 1, b: 1, c: 1 }, lastAskedAt: { a: '2026-09-01T00:00:00Z', b: '2026-09-05T00:00:00Z', c: '2026-09-10T00:00:00Z' } };
  check('횟수가 같으면 오래전에 물은 것이 먼저',
    pickInterviewActivity(pool, asked, 'seed')?.entityId === 'a');

  // 같은 씨앗이면 같은 답 — 새로고침해도 오늘의 질문 대상이 바뀌지 않는다.
  const first = pickInterviewActivity(pool, undefined, 'user:2026-09-18')?.entityId;
  check('같은 씨앗은 같은 결과',
    first === pickInterviewActivity(pool, undefined, 'user:2026-09-18')?.entityId);
  check('조회 순서가 달라도 같은 결과',
    first === pickInterviewActivity([...pool].reverse(), undefined, 'user:2026-09-18')?.entityId);

  // 날짜가 바뀌면 후보 순서가 돌아야 한다(안 그러면 매일 같은 활동만 나온다).
  const days = new Set(
    Array.from({ length: 12 }, (_, i) => pickInterviewActivity(pool, undefined, `user:2026-09-${i + 1}`)?.entityId),
  );
  check('날짜가 바뀌면 대상이 돈다', days.size > 1, [...days].join(','));
}

// ── 2. 공통 질문 트랙 ───────────────────────────────────────────────────────
console.log('2. 생기부가 얇아도 빈 화면이 되지 않는다');
{
  check('주제가 5개 이상', COMMON_QUESTION_THEMES.length >= 5);
  check('주제 id 가 유일',
    new Set(COMMON_QUESTION_THEMES.map((t) => t.id)).size === COMMON_QUESTION_THEMES.length);
  check('덜 쓴 주제가 먼저',
    pickCommonTheme({ counts: Object.fromEntries(COMMON_QUESTION_THEMES.map((t, i) => [t.id, i === 3 ? 0 : 5])), lastAskedAt: {} }, 's').id
      === COMMON_QUESTION_THEMES[3].id);
  check('없는 주제는 null', commonTheme('nope') === null);
  check('핸들러가 활동 0개일 때 공통 질문으로 넘어간다',
    /if \(!activity\) theme = pickCommonTheme/.test(HANDLER));
}

// ── 3. KST 하루 — 아카데미 구현과 드리프트 금지 ──────────────────────────────
console.log('3. 하루의 기준은 한국 시간 자정');
{
  check('15:00 UTC 전은 같은 날', koreaDay(new Date('2026-09-12T14:59:59Z')) === '2026-09-12');
  check('15:00 UTC 부터 다음 날', koreaDay(new Date('2026-09-12T15:00:00Z')) === '2026-09-13');
  // 일부러 따로 둔 두 구현이 같은 답을 내는지 — 이것이 복제를 허용한 조건이다.
  for (const iso of ['2026-01-01T00:00:00Z', '2026-06-30T14:59:59Z', '2026-12-31T15:00:01Z']) {
    check(`아카데미 구현과 일치 (${iso})`, koreaDay(new Date(iso)) === academyKoreaDay(new Date(iso)));
  }
}

// ── 4. 상한값이 SQL 과 TS 에서 같은가 ────────────────────────────────────────
console.log('4. 연습 횟수·버전 상한이 서버와 화면에서 같다');
{
  const practiceSql = MIGRATION.match(/if used >= (\d+) then/);
  const versionSql = MIGRATION.match(/if next_version > (\d+) then/);
  const stateSql = MIGRATION.match(/'practiceLimit', (\d+)/);
  check('SQL 에 연습 상한이 있다', !!practiceSql, MIGRATION.slice(0, 0));
  check('SQL 에 버전 상한이 있다', !!versionSql);
  check('SQL 에 practiceLimit 이 있다', !!stateSql);
  check(`연습 상한 일치 (TS ${PRACTICE_DAILY_LIMIT})`, Number(practiceSql?.[1]) === PRACTICE_DAILY_LIMIT, practiceSql?.[1]);
  check(`버전 상한 일치 (TS ${ANSWER_VERSION_LIMIT})`, Number(versionSql?.[1]) === ANSWER_VERSION_LIMIT, versionSql?.[1]);
  check('state RPC 가 돌려주는 값도 같다', Number(stateSql?.[1]) === PRACTICE_DAILY_LIMIT, stateSql?.[1]);
  // 꼬리 깊이: SQL 은 `depth >= FOLLOWUP_MAX_DEPTH + 1` 에서 끊는다.
  const depthSql = MIGRATION.match(/if depth >= (\d+) then/);
  check('꼬리 깊이 상한 일치', Number(depthSql?.[1]) === FOLLOWUP_MAX_DEPTH + 1, depthSql?.[1]);
}

// ── 5. 이력 집계 ────────────────────────────────────────────────────────────
console.log('5. 실패한 생성은 "물어본 것"이 아니다');
{
  const row = (over: Partial<InterviewPrepQuestionRow>): InterviewPrepQuestionRow => ({
    id: 'q', user_id: 'u', student_id: 's', day: null, kind: 'practice', parent_id: null,
    question: 'Q', intent: 'I', source_kind: 'activity', activity_entity_id: 'a', theme_id: null,
    source_label: null, source_excerpt: null, source_ref: {}, status: 'ready',
    lease_until: null, created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z',
    ...over,
  });
  const history = askHistoryOf([
    row({ activity_entity_id: 'a', created_at: '2026-09-10T00:00:00Z' }),
    row({ activity_entity_id: 'a', created_at: '2026-09-12T00:00:00Z' }),
    row({ activity_entity_id: 'b', status: 'failed' }),
    row({ activity_entity_id: null, theme_id: 'motivation', source_kind: 'common' }),
  ]);
  check('활동 횟수', history.activities.counts.a === 2);
  check('실패는 세지 않는다', history.activities.counts.b === undefined);
  check('가장 최근 시각', history.activities.lastAskedAt.a === '2026-09-12T00:00:00Z');
  check('공통 질문은 따로 센다', history.themes.counts.motivation === 1 && history.activities.counts.motivation === undefined);
}

// ── 6. 커버리지는 활동 수로 센다 ────────────────────────────────────────────
console.log('6. 커버리지 = 활동 수 (질문 수가 아니다)');
{
  const pool = [activity('a'), activity('b'), activity('c', { grade: 3 })];
  const coverage = interviewCoverage(pool, { counts: { a: 7 }, lastAskedAt: {} });
  check('한 활동을 7번 물어도 1개', coverage.covered === 1, String(coverage.covered));
  check('전체는 활동 수', coverage.total === 3);
  check('학년별로 나뉜다', coverage.byGrade.length === 2);
  check('학년 오름차순', coverage.byGrade[0].grade === 2 && coverage.byGrade[1].grade === 3);
  check('빈 후보는 0', interviewCoverage([]).total === 0);
}

// ── 7. KG 엔티티 파싱 ───────────────────────────────────────────────────────
console.log('7. 활동 후보 파싱');
{
  const rows = [
    {
      entity_id: 'acti_2', label: '적정 실험', type: 'Activity',
      properties: {
        sources: [{ grade: 2, semester: 1, subject: '화학Ⅰ', activity_id: 'act:rec-1#3' }],
        evidence: ['연구 질문: 지시약 선택이 결과에 주는 영향', '메틸오렌지를 선택했다'],
        level: 3, usefulness: 6,
      },
    },
    { entity_id: 'acti_1', label: '동아리', type: 'Activity', properties: { sources: [{ grade: 1, category: '동아리' }] } },
    { entity_id: 'comp_1', label: '역량', type: 'Competency', properties: {} },
  ];
  const candidates = activityCandidatesFromEntities(rows);
  check('Activity 만 남는다', candidates.length === 2);
  check('entity_id 순으로 고정', candidates.map((c) => c.entityId).join(',') === 'acti_1,acti_2');
  const chem = candidates.find((c) => c.entityId === 'acti_2')!;
  check('sources[0] 에서 학년·과목', chem.grade === 2 && chem.subject === '화학Ⅰ');
  check('연구 질문을 분리', chem.researchQuestion === '지시약 선택이 결과에 주는 영향');
  check('인용에서 연구 질문 줄은 뺀다', chem.evidence.length === 1);
  check('분절 id 를 보존', chem.sourceActivityIds[0] === 'act:rec-1#3');
  check('라벨 조합', activitySourceLabel(chem) === '2학년 · 화학Ⅰ');
  check('과목이 없으면 영역으로', activitySourceLabel(candidates[0]) === '1학년 · 동아리');
  check('발췌에 연구 질문이 앞선다', activityExcerpt(chem)?.startsWith('연구 질문:') === true);
  check('인용이 없으면 발췌 없음',
    activityExcerpt(activity('x', { evidence: [], researchQuestion: null })) === null);
}

// ── 8. ★ 발췌는 원문 표를 다시 읽지 않는다 ──────────────────────────────────
console.log('8. `#n` 함정 — 원문 기록을 되찾지 않는다');
{
  check('핸들러가 student_detailed_activities 를 읽지 않는다',
    !HANDLER.includes('student_detailed_activities'));
  check('핸들러가 activity_id 접미를 파싱하지 않는다',
    !/split\(['"]#/.test(HANDLER) && !HANDLER.includes("slice(4)"));
  check('발췌는 KG 인용에서 만든다', SHARED.includes('export function activityExcerpt'));
}

// ── 9. ★ 서버와 화면이 같은 KG 버전을 고른다 ────────────────────────────────
console.log('9. 버전 선택 규칙은 한 곳에만 있다');
{
  check('공용 선택 함수가 있다', SHARED.includes('export async function loadActivityCandidates'));
  check('서버가 그 함수를 쓴다', HANDLER.includes('loadActivityCandidates('));
  check('화면이 그 함수를 쓴다', HOOKS.includes('loadActivityCandidates('));
  check('훑는 세대 수도 공유', HANDLER.includes('KG_VERSION_SCAN_LIMIT') && HOOKS.includes('KG_VERSION_SCAN_LIMIT'));

  // 활동이 있는 첫 세대를 고르고, 거기서 멈춘다(뒷 세대를 긁지 않는다).
  const asked: string[] = [];
  const found = await loadActivityCandidates(
    [{ id: 'v3' }, { id: 'v2' }, { id: 'v1' }],
    async (id) => {
      asked.push(id);
      return id === 'v2'
        ? [{ entity_id: 'acti_1', label: 'A', type: 'Activity', properties: {} }]
        : [];
    },
  );
  check('활동이 있는 최신 세대를 고른다', found?.versionId === 'v2', found?.versionId);
  check('찾으면 더 훑지 않는다', asked.join(',') === 'v3,v2', asked.join(','));
  check('전부 비면 null', (await loadActivityCandidates([{ id: 'v1' }], async () => [])) === null);
}

// ── 10. 요청 파싱 ───────────────────────────────────────────────────────────
console.log('10. 요청 파싱이 잘못된 입력을 막는다');
{
  const ok = (v: unknown) => { try { parseInterviewPrepRequest(v); return true; } catch { return false; } };
  check('mode 필수', !ok({}));
  check('알 수 없는 mode 거부', !ok({ mode: 'hack' }));
  check('daily 는 인자 없이 통과', ok({ mode: 'daily' }));
  check('evaluate 는 questionId 필수', !ok({ mode: 'evaluate', answer: 'x'.repeat(30) }));
  const uuid = '11111111-2222-3333-4444-555555555555';
  check('questionId 는 uuid 형식', !ok({ mode: 'evaluate', questionId: 'abc', answer: 'x'.repeat(30) }));
  check('답변 20자 미만 거부', !ok({ mode: 'evaluate', questionId: uuid, answer: '짧다' }));
  check('답변 6000자 초과 거부', !ok({ mode: 'evaluate', questionId: uuid, answer: 'x'.repeat(6001) }));
  check('정상 evaluate 통과', ok({ mode: 'evaluate', questionId: uuid, answer: 'x'.repeat(30) }));
  check('활동과 주제 동시 지정 거부',
    !ok({ mode: 'practice', activityEntityId: 'a', themeId: 'motivation' }));
  check('없는 주제는 무시되어 자동 선택으로 떨어진다',
    parseInterviewPrepRequest({ mode: 'practice', themeId: 'nope' }).themeId === null);
  check('followup 은 questionId 필수', !ok({ mode: 'followup' }));
  check('답변 앞뒤 공백은 정리', parseInterviewPrepRequest({ mode: 'evaluate', questionId: uuid, answer: `  ${'x'.repeat(30)}  ` }).answer?.length === 30);
}

// ── 11. 스레드 조립 ─────────────────────────────────────────────────────────
console.log('11. 질문 → 답변 → 꼬리 질문 묶기');
{
  const q = (id: string, parent: string | null, at: string): InterviewPrepQuestionRow => ({
    id, user_id: 'u', student_id: 's', day: null, kind: parent ? 'followup' : 'practice',
    parent_id: parent, question: `Q${id}`, intent: 'I', source_kind: 'activity',
    activity_entity_id: 'acti_1', theme_id: null, source_label: '2학년 · 화학Ⅰ',
    source_excerpt: null, source_ref: { grade: 2 }, status: 'ready', lease_until: null,
    created_at: at, updated_at: at,
  });
  const a = (id: string, questionId: string, version: number, score: number) => ({
    id, question_id: questionId, user_id: 'u', student_id: 's', version,
    answer: 'A', status: 'ready' as const, lease_until: null,
    created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z',
    evaluation: {
      kind: 'general' as const,
      criteria: [
        { id: 'S1', score, evidence: 'e', feedback: 'f' },
        { id: 'S4', score: 1, evidence: 'e', feedback: 'f' },
      ],
      strength: 's', improvement: 'i', followUp: 'next?',
    },
  });

  const threads = buildInterviewThreads(
    [q('q1', null, '2026-09-10T00:00:00Z'), q('q2', 'q1', '2026-09-11T00:00:00Z'), q('q3', null, '2026-09-12T00:00:00Z')],
    [a('a2', 'q1', 2, 3), a('a1', 'q1', 1, 1)],
  );
  check('뿌리는 최신이 위', threads.map((t) => t.question.id).join(',') === 'q3,q1');
  const root = threads.find((t) => t.question.id === 'q1')!;
  check('꼬리 질문이 자식으로', root.children.map((c) => c.question.id).join(',') === 'q2');
  check('답변은 version 오름차순', root.answers.map((x) => x.version).join(',') === '1,2');
  check('가장 최근 평가는 마지막 버전', latestEvaluatedAnswer(root)?.id === 'a2');
  check('펼치면 꼬리까지', flattenThreads(threads).length === 3);
  check('평가 목록은 꼬리까지 훑는다', evaluationsOf(threads).length === 2);

  // 부모를 못 찾은 꼬리 질문도 버리지 않는다 — 버리면 학생 기록이 화면에서 사라진다.
  const orphan = buildInterviewThreads([q('q9', 'missing', '2026-09-13T00:00:00Z')], []);
  check('고아 꼬리 질문은 뿌리로', orphan.length === 1 && orphan[0].question.id === 'q9');

  const groups = groupThreadsByActivity(threads);
  check('활동별로 묶인다', groups.length === 1 && groups[0].key === 'acti_1');
  check('학년은 source_ref 에서', groups[0].grade === 2);
  check('평가받은 답변 수', groups[0].answeredCount === 2);

  const weak = weakestCriteria(threads, 2);
  check('가장 약한 기준이 먼저', weak[0].id === 'S4', weak.map((w) => w.id).join(','));
  check('기준 이름이 붙는다', weak[0].label === '전공·진로 연결', weak[0].label);
  check('평균이지 합계가 아니다', rubricAverages(evaluationsOf(threads))[0].average === 1);
}

// ── 12. 임대 만료 판정 ──────────────────────────────────────────────────────
console.log('12. 멈춘 작업에 화면이 갇히지 않는다');
{
  const now = Date.parse('2026-09-18T00:00:00Z');
  check('임대가 살아 있으면 작업 중',
    isInFlight({ status: 'generating', lease_until: '2026-09-18T00:01:00Z' }, now));
  check('임대가 만료되면 작업 중이 아니다',
    !isInFlight({ status: 'generating', lease_until: '2026-09-17T23:59:00Z' }, now));
  check('ready 는 작업 중이 아니다',
    !isInFlight({ status: 'ready', lease_until: '2026-09-18T00:01:00Z' }, now));
  check('null 안전', !isInFlight(null, now));
}

// ── 13. 프롬프트 — 페르소나가 중립인가 ──────────────────────────────────────
console.log('13. 로판 컨셉이 새지 않는다');
{
  const prompts = [
    interviewPrepQuestionPrompt({ sourceKind: 'activity' }),
    interviewPrepQuestionPrompt({ sourceKind: 'common', themeGuide: '지원 동기' }),
    interviewPrepEvaluatePrompt(),
  ].join('\n');
  for (const word of ['로맨스', '판타지', '아카데미', '리아', '별자리', '교수', '별빛']) {
    check(`프롬프트에 '${word}' 가 없다`, !prompts.includes(word));
  }
  check('면접 코치 페르소나', prompts.includes('면접 코치'));
  check('자료를 데이터로 읽으라는 규칙이 먼저',
    prompts.indexOf('신뢰할 수 없는 데이터') < prompts.indexOf('JSON'));
  check('경험 날조 금지', prompts.includes('만들어내지 않는다'));
  check('합격 확률 금지', prompts.includes('합격 확률'));
  check('평가 프롬프트에 루브릭 id 가 실린다',
    interviewPrepEvaluatePrompt().includes('"S1"') && interviewPrepEvaluatePrompt().includes('Feeling'));
  check('빈 질문은 쓰지 않는다',
    !isUsableQuestion({ question: ' ', intent: 'x' }) && isUsableQuestion({ question: 'q', intent: 'i' }));
}

// ── 13-2. ★ 기록 대조 — 자료를 주고 "쓰라"고 말하는가 ────────────────────────
console.log('13-2. 답변을 생기부 기록과 대조하라고 지시한다');
{
  const prompt = interviewPrepEvaluatePrompt();
  // 발췌를 payload 에 싣기만 하고 지시하지 않으면 모델이 쓸 수도 안 쓸 수도 있다 —
  // 그러면 학생이 기록에 없는 이야기로 좋은 점수를 받고 실제 면접에서 막힌다.
  check('대조하라고 명시한다', /답변을 그 기록과 반드시 대조|기록과 \*\*반드시 대조|반드시 대조/.test(prompt));
  check('세 판정이 모두 정의된다',
    prompt.includes('consistent') && prompt.includes('unsupported') && prompt.includes('conflict'));
  check('기록에 없다고 틀린 것이 아님을 못 박는다', prompt.includes('기록에 없다고 해서 틀린 것이 아니다'));
  check('면접관이 생기부만 본다는 점을 알리게 한다', prompt.includes('생활기록부만 보고'));
  check('record 가 없으면 null 임을 명시', prompt.includes('record 가 없으면 recordCheck 는 null'));
  check('핸들러가 기록 발췌를 실어 보낸다', /record: question\.source_excerpt/.test(HANDLER));
  check('핸들러가 새 파서를 쓴다', HANDLER.includes('parseInterviewPrepEvaluation('));

  // 학술 참고 — 생활기록부는 학생이 고칠 수 없는 문서다.
  check('학술적 부정확을 알리라고 지시한다', prompt.includes('학술적으로 부정확'));
  check('확신 없으면 null 로 두게 한다', prompt.includes('확신할 수 없거나'));
  check('교사를 탓하지 않게 한다', prompt.includes('작성한 교사를 탓하지 않는다'));
  check('대안(면접에서 어떻게 말할지)을 요구한다', prompt.includes('보완해 설명할지'));
}

// ── 13-3. 파싱 — 선택 항목이 전체를 망가뜨리지 않는다 ───────────────────────
console.log('13-3. 기록 대조·학술 참고 파싱');
{
  const base = {
    kind: 'general',
    criteria: interviewRubric('general').map((r) => ({ id: r.id, score: 2, evidence: 'e', feedback: 'f' })),
    strength: 's', improvement: 'i', followUp: 'n',
  };
  const ok = parseInterviewPrepEvaluation({
    ...base,
    recordCheck: { status: 'conflict', note: '기록에는 메틸오렌지, 답변에는 페놀프탈레인' },
    academicNote: { concern: '종말점 설명이 정확하지 않습니다', suggestion: '적정 곡선의 급변 구간으로 설명하세요' },
  });
  check('정상 파싱', ok.recordCheck?.status === 'conflict' && !!ok.academicNote);
  check('기준은 그대로', ok.criteria.length === 4 && ok.strength === 's');

  // 선택 항목이 깨져도 30~90초 걸린 평가 전체를 버리면 안 된다.
  const broken = parseInterviewPrepEvaluation({
    ...base, recordCheck: { status: 'nope', note: 'x' }, academicNote: { concern: '지적만 있음' },
  });
  check('잘못된 status 는 null 로 떨어진다', broken.recordCheck === null);
  check('대안 없는 학술 지적은 버린다', broken.academicNote === null);
  check('그래도 루브릭은 살아남는다', broken.criteria.length === 4);

  const absent = parseInterviewPrepEvaluation(base);
  check('없으면 null', absent.recordCheck === null && absent.academicNote === null);

  // 루브릭 자체가 깨지면 여전히 던져야 한다(이건 평가가 아니다).
  let threw = false;
  try { parseInterviewPrepEvaluation({ ...base, criteria: [] }); } catch { threw = true; }
  check('루브릭이 없으면 거부', threw);
}

// ── 13-4. 화면이 두 항목을 그린다 ───────────────────────────────────────────
console.log('13-4. 화면 표시 — 점수가 아니라 참고');
{
  const view = read('src/features/interview-prep/components/InterviewThreadView.tsx');
  check('기록 대조를 그린다', view.includes('evaluation.recordCheck'));
  check('학술 참고를 그린다', view.includes('evaluation.academicNote'));
  check('conflict 는 로즈, unsupported 는 앰버',
    /conflict[\s\S]{0,120}rose/.test(view) && /unsupported[\s\S]{0,120}amber/.test(view));
  check('unsupported 를 오답처럼 칠하지 않는다', !/unsupported[^\n]*rose/.test(view));
  check('AI 의견임을 밝힌다', view.includes('AI 참고 의견'));
  check('학술 참고에 대안을 함께 보여준다', view.includes('면접에서는'));
  // 루브릭 점수는 여전히 점으로만 — 새 항목이 점수처럼 보이면 안 된다.
  check('두 항목에 점수를 매기지 않는다',
    !/recordCheck[\s\S]{0,200}RubricDots/.test(view) && !/academicNote[\s\S]{0,200}RubricDots/.test(view));
}

// ── 14. 마이그레이션 — 권한이 뚫려 있지 않은가 ──────────────────────────────
console.log('14. 쓰기는 서버 전용 · 읽기는 본인과 교직원');
{
  for (const table of ['interview_prep_questions', 'interview_prep_answers']) {
    check(`${table} RLS 켜짐`, MIGRATION.includes(`alter table public.${table} enable row level security`));
    check(`${table} authenticated 권한 회수 후 select 만`,
      MIGRATION.includes(`revoke all on public.${table} from public, anon, authenticated`)
      && MIGRATION.includes(`grant select on public.${table} to authenticated`));
  }
  check('INSERT 정책이 없다', !/create policy[^;]*for insert/i.test(MIGRATION));
  check('UPDATE 정책이 없다', !/create policy[^;]*for update/i.test(MIGRATION));
  check('DELETE 정책이 없다', !/create policy[^;]*for delete/i.test(MIGRATION));
  check('읽기 정책이 교사 함수를 쓴다', MIGRATION.includes('public.is_teacher_or_admin'));
  // 주석은 걷어내고 본다 — 이 파일의 주석이 "직원용 함수를 쓰지 않는 이유"를 설명하므로
  // 원문 그대로 검사하면 설명 문장에 걸린다.
  const sqlOnly = MIGRATION.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  check('직원까지 여는 함수를 쓰지 않는다', !sqlOnly.includes('is_staff_teacher_or_admin'));

  // 쓰기 RPC 4종은 service_role 전용 — `public` 과 `anon` 을 **둘 다** 회수해야 한다.
  for (const fn of [
    'interview_prep_claim_question', 'interview_prep_finish_question',
    'interview_prep_claim_answer', 'interview_prep_finish_answer',
  ]) {
    const revoked = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*from public, anon, authenticated`).test(MIGRATION);
    const granted = new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*to service_role`).test(MIGRATION);
    check(`${fn} 는 public·anon·authenticated 회수`, revoked);
    check(`${fn} 는 service_role 에만 부여`, granted);
  }
  check('state RPC 는 authenticated 에 부여',
    /grant execute on function public\.interview_prep_state\(\) to authenticated/.test(MIGRATION));
  check('state RPC 도 anon 회수',
    /revoke all on function public\.interview_prep_state\(\) from public, anon/.test(MIGRATION));
  check('모든 함수가 search_path 를 고정',
    (MIGRATION.match(/set search_path = ''/g) ?? []).length
      === (MIGRATION.match(/^create function/gm) ?? []).length);
  check('claim 은 학생 역할을 재검증', MIGRATION.includes("role = 'student'"));
  check('교사 체험은 테스트 학생으로만 (DB 재검증)',
    DEMO_MIGRATION.includes(`role in ('teacher','admin') and p_student = '${INTERVIEW_PREP_DEMO_STUDENT_ID}'`));
  check('하루 하나 유니크 인덱스', MIGRATION.includes("on public.interview_prep_questions(user_id, day) where kind = 'daily'"));
  check('동시 생성은 기존 행을 돌려준다', MIGRATION.includes('exception when unique_violation'));
}

// ── 15. 핸들러 안전장치 ─────────────────────────────────────────────────────
console.log('15. 엣지 함수가 실패를 남기지 않는다');
{
  check('학적 코드는 역할에서 서버가 유도', HANDLER.includes('interviewPrepStudentIdFor(profile?.role, user.email)'));
  check('유도 실패(직원 등)는 거부', /if \(!studentId\)[\s\S]{0,80}403/.test(HANDLER));
  check('요청 본문의 학적 코드를 받지 않는다', !/input\.student/.test(HANDLER));
  check('잘린 응답을 확정 판정', HANDLER.includes("finish_reason === 'length'"));
  check('추론 예산을 끈다', HANDLER.includes("reasoning_effort: 'none'"));
  // 2026-10-23 사용자 결정 — 피드백(평가)은 luna, 질문은 Solar 그대로
  check('평가 = gpt-6-luna · 질문 = solar-pro4', HANDLER.includes("EVALUATE_MODEL = 'gpt-6-luna'") && HANDLER.includes("QUESTION_MODEL = 'solar-pro4'")
    && HANDLER.includes('await chatEvaluate(aiFetch, key, interviewPrepEvaluatePrompt(), payload)'));
  check('luna 예산 = 하한 12,000 · temperature 미전송 · 게이트웨이보다 먼저 포기',
    HANDLER.includes('EVALUATE_MAX_COMPLETION_TOKENS = 12_000') && !/temperature/.test(HANDLER.slice(HANDLER.indexOf('async function chatEvaluate'), HANDLER.indexOf('async function chatEvaluate') + 900))
    && HANDLER.includes('AbortSignal.timeout(120_000)'));
  check('평가 결과에 모델을 남긴다', HANDLER.includes('finish({ ...parsed, model: EVALUATE_MODEL })'));
  check('평가는 OpenAI 키만 요구한다', /mode === 'evaluate'[\s\S]{0,200}OPENAI_API_KEY/.test(HANDLER));
  check('실패 시 행을 닫는다', /finish\(null/.test(HANDLER));
  check('꼬리 질문은 LLM 을 부르지 않는다',
    HANDLER.includes('async function followUp') && !/async function followUp[\s\S]*?\n}/.exec(HANDLER)?.[0].includes('chat('));
  check('쓰기는 writer(service_role) 로만', !/db\.rpc\(/.test(HANDLER));
  check('브라우저가 보낸 user id 를 쓰지 않는다', !HANDLER.includes('input.userId'));
}

// ── 16. 메뉴·라우트 정합 ────────────────────────────────────────────────────
console.log('16. 메뉴 · 라우트 · 카탈로그가 어긋나지 않는다');
{
  const APP = read('src/App.tsx');
  const href = commonNavItems.interviewPrep.href;
  check('href 는 /interview-prep', href === '/interview-prep');
  const inStudentNav = studentNavSections.some((s) => s.items.some((i) => 'href' in i && i.href === href));
  check('학생 네비에 있다', inStudentNav);
  // 교사는 [학생 메뉴]에서 테스트 학생으로 체험한다 (2026-09-23). 직원은 학생 정보 차단 역할이라 닫는다.
  check('교사 네비 [학생 메뉴]에 있다', regularNavSections.some((s) => s.id === 'student-menus'
    && s.items.some((i) => 'href' in i && i.href === href)));
  check('직원에게는 기본으로 닫혀 있다', isPathBlockedForStaff(href));
  check('학생 허용 라우트 목록에 있다', studentAllowedRoutes.includes(href));
  check('메뉴 관리 카탈로그에 있다', MANAGED_MENU_BY_KEY.has(href));
  check('라우트 = 학생 + 교사·관리자', APP.includes(`<Route path="${href}" element={<ProtectedRoute allowed={['student', ...TEACHER_ROLES]}>`));
  check('생기부 분석 탭은 학생에게 감춘다',
    /\{!isStudent && <TabsTrigger value="interview-prep"/.test(read('src/features/evalog/components/evaluation/EvaluationPanel.tsx')));
  check('탭 내용도 같은 조건으로 감춘다',
    /\{!isStudent && \(\s*<TabsContent value="interview-prep"/.test(read('src/features/evalog/components/evaluation/EvaluationPanel.tsx')));
}

// ── 16-1. 누구의 생기부로 연습하는가 ────────────────────────────────────────
console.log('16-1. 학생은 본인, 교사·관리자는 테스트 학생, 직원은 불가');
{
  check('테스트 학생은 00-00001', INTERVIEW_PREP_DEMO_STUDENT_ID === '00-00001');
  check('학생 = 이메일 prefix', interviewPrepStudentIdFor('student', 'user394@example.com') === '00-00673');
  check('교사 = 테스트 학생', interviewPrepStudentIdFor('teacher', 't@myschool.hs.kr') === '00-00001');
  check('관리자 = 테스트 학생', interviewPrepStudentIdFor('admin', 'a@myschool.hs.kr') === '00-00001');
  check('직원 = 불가', interviewPrepStudentIdFor('staff', 's@myschool.hs.kr') === null);
  check('역할 미상 = 불가', interviewPrepStudentIdFor(null, 'x@myschool.hs.kr') === null);
  check('이메일 없는 학생 = 불가', interviewPrepStudentIdFor('student', null) === null);
  check('화면은 실제 profile.role 로 판정(미리보기 아님)',
    read('src/features/interview-prep/InterviewPrepPage.tsx').includes('studentCodeOf(profile?.role, user?.email)'));
}

// ── 17. 말하기 시간 표기────────────────────────────────────────────────────
console.log('17. 어림값은 어림으로 적는다');
{
  check('짧은 답변', speakingLabel(100) === '30초 미만');
  check('한 문단', speakingLabel(400) === '약 1분');
  check('긴 답변은 분 단위', /^약 \d/.test(speakingLabel(1200)));
  check('초 단위를 노출하지 않는다', !speakingLabel(1200).includes('초'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
