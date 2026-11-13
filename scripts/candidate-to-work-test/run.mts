// 업무 후보 → 업무·할 일 만들기 회귀 — npx tsx scripts/candidate-to-work-test/run.mts
//
// 이 부류는 **오류 없이 그럴듯하게 틀린다**: 1·2월 문서가 같은 해로 잡혀 기한이 10개월 앞당겨지거나,
// 지난 학년도 날짜가 그대로 들어가 만들자마자 «기한 지남»이 되거나, 동명이인에게 할 일이 붙거나,
// 연간 가져오기가 «어느 후보에서 왔는지»를 복사해 지도가 같은 후보를 두 업무로 세거나.
import { readFileSync } from 'node:fs';
import {
  academicDateOf,
  buildCandidateWorkDraft,
  candidateLinkKey,
  candidateLinkOf,
  convertedCandidates,
  draftToInsert,
  matchPeople,
  onceOptions,
  procedureBases,
  retargetDraftYear,
  shiftByYears,
  stepsToTasks,
  validateCandidateWorkDraft,
  CANDIDATE_LINK_KEY,
  type PersonOption,
} from '../../src/lib/candidateToWork';
import { parseProcedures, type ProcedureEntry, type WorkCandidate } from '../../src/lib/workCandidates';
import { WORK_META_ROLLOVER_POLICY } from '../../src/lib/workRollover';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`✗ ${name}`, detail ?? '');
}

const candidate = (over: Partial<WorkCandidate> = {}): WorkCandidate => ({
  id: 'c1', academic_year: 2026, kind: 'work', code: 'P123', name: '성과상여금 지급',
  area_name: '급여', seat_id: null, seat_label: '지출·급여', department: '행정실', brm: '인사관리',
  work_type: '정기', scale: null, load: null, months: [], repeat_hint: null, counts: {}, budget: null,
  note: null, meta: { summary: '한 줄 요약' }, ...over,
} as WorkCandidate);

const roster: PersonOption[] = [
  { id: 'r1', name: '정유찬' }, { id: 'r2', name: '서예준' },
  { id: 'r3', name: '김동명' }, { id: 'r4', name: '김동명' },
];

const entry: ProcedureEntry = {
  person: '정유찬', kind: '절차', cycle: null, summary: '계획 → 신청 → 지급.', revised: null, related: [],
  steps: [
    { name: '계획 접수', by: null, docs: [{ date: '03-13', dir: 0, title: null }] },
    { name: '징수결의', by: '서예준', docs: [{ date: '03-30', dir: 1, title: null }, { date: '04-02', dir: 1, title: null }] },
    { name: '정산', by: null, docs: [{ date: '02-10', dir: 1, title: null }] },
    { name: '사람 미상', by: '없는사람·김동명', docs: [] },
  ],
};

// ── ① 날짜: 학년도 안의 날짜, 1·2월은 다음 해 ──
check('03-13 → 2026', academicDateOf('03-13', 2026) === '2026-03-13');
check('02-10 → 2027(1·2월은 다음 해)', academicDateOf('02-10', 2026) === '2027-02-10');
check('형식 아님 → null', academicDateOf('3/13', 2026) === null && academicDateOf('13-01', 2026) === null);
check('학년도 옮기기', shiftByYears('2026-04-02', 1) === '2027-04-02');
check('윤일 → 28일', shiftByYears('2028-02-29', 1) === '2029-02-28');
check('윤일 → 윤년이면 그대로', shiftByYears('2024-02-29', 4) === '2028-02-29');

// ── ② 사람: 정확히 한 명일 때만 ──
const m = matchPeople(['정유찬', '서예준·정유찬', '김동명', '없는사람', null], roster);
check('정확히 한 명만 연결', m.matched.map((p) => p.id).join() === 'r1,r2', m);
check('동명이인·없는 이름은 못 찾음', m.unmatched.join() === '김동명,없는사람', m);

// ── ③ 단계 → 할 일 ──
const same = stepsToTasks(entry, { candidateYear: 2026, targetYear: 2026, roster });
check('단계 수만큼', same.length === 4);
check('기한 = 마지막 근거 날짜', same[1].due === '2026-04-02', same[1]);
check('2월 단계는 다음 해 기한', same[2].due === '2027-02-10', same[2]);
check('근거 없는 단계는 기한 없음', same[3].due === null);
check('by 가 있으면 그 사람', same[1].assignees.map((a) => a.id).join() === 'r2');
check('by 가 없으면 절차의 사람', same[0].assignees.map((a) => a.id).join() === 'r1');
check('못 찾은 이름은 남긴다', same[3].unmatched.join() === '없는사람,김동명', same[3]);
check('설명에 처리 시기·기안 수', /03\.30~04\.02/.test(same[1].description) && /학교 기안 2건/.test(same[1].description), same[1].description);
const next = stepsToTasks(entry, { candidateYear: 2026, targetYear: 2027, roster });
check('다음 학년도로 만들면 기한도 한 해 뒤', next[1].due === '2027-04-02' && next[2].due === '2028-02-10', next.map((t) => t.due));

// ── ④ 초안·검증·저장 값 ──
const draft = buildCandidateWorkDraft({ candidate: candidate(), base: entry, once: [], targetYear: 2026, roster, managers: [{ id: 'r1', name: '정유찬' }] });
check('초안 이름·부서·학년도', draft.name === '성과상여금 지급' && draft.department === '행정실' && draft.year === 2026);
check('설명 폴백 = 절차 요약', draft.description === '계획 → 신청 → 지급.', draft.description);
check('검증 통과', validateCandidateWorkDraft(draft) === null, validateCandidateWorkDraft(draft));
check('매니저 없으면 거부', validateCandidateWorkDraft({ ...draft, managers: [] }) !== null);
check('빈 제목 거부', validateCandidateWorkDraft({ ...draft, tasks: [{ ...draft.tasks[0], title: ' ' }] }) !== null);
const moved = retargetDraftYear(draft, 2027);
check('학년도 바꾸면 기한도 함께', moved.year === 2027 && moved.tasks[1].due === '2027-04-02');

const mixed = { ...draft, tasks: [draft.tasks[0], { ...draft.tasks[1], type: 'one_time' as const }, draft.tasks[2]] };
const insert = draftToInsert(mixed, candidate(), new Date('2026-10-05T00:00:00Z'));
check('절차 순서 = 놓인 순서대로 1부터, 일회성 = 0',
  insert.tasks.map((t) => t.order_index).join() === '1,0,2', insert.tasks.map((t) => t.order_index));
check('담당자 = pending', insert.tasks[0].meta.assignees && (insert.tasks[0].meta.assignees as Array<{ status: string }>)[0].status === 'pending');
check('업무 meta 에 링크·학년도·부서', insert.work.meta.year === 2026 && insert.work.meta.department === '행정실'
  && candidateLinkOf(insert.work.meta)?.code === 'P123');
check('키워드 = 유형·BRM', insert.work.keywords.join() === '정기,인사관리');
check('사업비는 옮기지 않는다', !JSON.stringify(insert).includes('budget'));

// ── ⑤ 링크 → 지도 ──
const map = convertedCandidates([
  { id: 'w1', name: '만든 업무', meta: insert.work.meta },
  { id: 'w2', name: '보통 업무', meta: { year: 2026 } },
  { id: 'w3', name: '깨진 링크', meta: { [CANDIDATE_LINK_KEY]: { id: 1 } } },
]);
check('만든 업무만 지도에', map.size === 1 && map.get(candidateLinkKey(candidate()))?.workId === 'w1', [...map]);
check('사람이 만든 후보는 id 로 잇는다', candidateLinkKey(candidate({ code: null })) === '2026:id:c1');
check('학년도가 다르면 다른 후보', candidateLinkKey(candidate({ academic_year: 2027 })) !== candidateLinkKey(candidate()));

// ── ⑥ 연간 가져오기는 링크를 버린다(지난 업무를 가져와도 «후보에서 만든 업무»가 둘이 되지 않게) ──
check('연간 가져오기 = drop', (WORK_META_ROLLOVER_POLICY as Record<string, string>)[CANDIDATE_LINK_KEY] === 'drop');

// ── ⑦ 실제 절차 검토(2026-09-29) 전부를 초안으로 — 모양이 어긋난 자료에도 죽지 않는가 ──
const seed = JSON.parse(readFileSync('scripts/work-candidate-seed/procedures-2026.json', 'utf8')) as { works: Record<string, unknown> };
let works = 0, withBase = 0, onceCount = 0, tasks = 0, badDue = 0, febNext = 0;
for (const [name, raw] of Object.entries(seed.works)) {
  const entries = parseProcedures(raw);
  works += 1;
  const bases = procedureBases(entries);
  const onces = onceOptions(entries);
  if (bases.length) withBase += 1;
  onceCount += onces.length;
  check(`일회성 후보에 분류 오류 없음 · ${name}`, onces.every((o) => o.once?.owner !== '분류 오류'));
  for (const base of bases) {
    const d = buildCandidateWorkDraft({ candidate: candidate({ name }), base, once: onces, targetYear: 2027, roster, managers: [roster[0]] });
    tasks += d.tasks.length;
    for (const t of d.tasks) {
      if (t.due && !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) badDue += 1;
      if (t.due && /^\d{4}-0[12]-/.test(t.due)) {
        if (t.due.startsWith('2028')) febNext += 1;
        else check(`1·2월 기한은 다음 해 · ${name} · ${t.title}`, false, t.due);
      }
    }
    check(`검증 통과 · ${name}`, validateCandidateWorkDraft(d) === null, validateCandidateWorkDraft(d));
  }
}
check('절차가 있는 업무가 있다', withBase > 50, withBase);
check('일회성 «올릴 만함»이 있다', onceCount > 30, onceCount);
check('기한 형식 전부 맞음', badDue === 0, badDue);
console.log(`실자료: 업무 ${works} · 절차 바탕 있음 ${withBase} · 일회성 덧붙이기 ${onceCount} · 초안 할 일 ${tasks} · 다음 해 1·2월 기한 ${febNext}`);

// ── ⑧ 배선(정적) — 오류 없이 빠지는 자리 ──
const pivot = readFileSync('src/components/tasks/WorkPivotTab.tsx', 'utf8');
check('지도: 만든 후보를 후보 수에서 뺀다', /countCandidatesByRow\(\s*candidates\.filter\(\(c\) => !converted\.has\(candidateLinkKey\(c\)\)\)/.test(pivot));
check('지도: 서랍에 converted 를 넘긴다', /converted=\{converted\}/.test(pivot));
const drawer = readFileSync('src/components/tasks/WorkCandidateDialog.tsx', 'utf8');
check('서랍: 만들기 창을 겹쳐 띄운다', /<CandidateWorkDialog/.test(drawer) && /업무로 만듦/.test(drawer));
const dialog = readFileSync('src/components/tasks/CandidateWorkDialog.tsx', 'utf8');
check('만들기 창: 저장 전에 검증', /validateCandidateWorkDraft\(draft\)/.test(dialog) && /disabled=\{!draft \|\| !!error \|\| saving\}/.test(dialog));
check('만들기 창: 목록 갱신', /invalidateQueries\(\{ queryKey: \['works-jsonb'\] \}\)/.test(dialog));
const service = readFileSync('src/services/candidateWorkService.ts', 'utf8');
check('저장: 할 일 실패 시 업무 되돌림', /from\('work'\)\.delete\(\)\.eq\('id', workId\)/.test(service));

console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
