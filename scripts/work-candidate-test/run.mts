// 업무 후보 회귀 — npx tsx scripts/work-candidate-test/run.mts
//
// 이 부류의 사고는 **조용히 덜 붙는 것**이다: 행정실 자리 9개가 통째로 「자리 없음」이 되거나,
// 후보가 없는 축에서 0 이 찍혀 "후보가 없다"로 읽히거나, 시드를 다시 돌려 사람이 고친 이름이
// 되돌아가거나. 전부 오류를 내지 않는다.
import { readFileSync } from 'node:fs';
import {
  candidateBudget,
  candidateDetail,
  candidateDocCount,
  candidateOwner,
  candidateRenamedFrom,
  candidateSummary,
  candidateSupports,
  candidateTierCounts,
  candidateProcedureSummary,
  parseProcedures,
  sortProcedures,
  PROCEDURE_KINDS,
  formatMoney,
  isAdminOfficeCandidate,
  budgetItemsOf,
  candidateBudgetNotices,
  candidateIncomingBudgetNotices,
  evidenceTierLabel,
  ownerMatchOf,
  parseEvidence,
  sharedBudgetKeys,
  splitBudgetName,
  EVIDENCE_TIERS,
  OUTGOING_NOTICE_KINDS,
  UNASSIGNED_ROW_KEY,
  UNKNOWN_ROW_KEY,
  candidatePeriod,
  candidatesForRow,
  countCandidatesByRow,
  groupCandidatesByArea,
  normalizeCandidateDraft,
  normalizeCandidateSeatName,
  resolveCandidateSeatId,
  validateCandidateDraft,
  type WorkCandidate,
} from '../../src/lib/workCandidates';
import { adminSeatRank, compareDutySeats } from '../../src/lib/dutySeats';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail: unknown = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

const cand = (p: Partial<WorkCandidate>): WorkCandidate => ({
  id: 'x', academic_year: 2026, kind: 'work', code: null, name: '이름', area_name: null,
  seat_id: null, seat_name: null, seat_label: null, department: null, brm: null,
  work_type: null, scale: null, load: null, months: [], repeat_hint: null,
  counts: {}, note: null, meta: {}, budget: null, created_at: '', updated_at: '', ...p,
});

/** 지금의 시드 — 2026-09-28 재검토 반영 목록 */
const SEED = 'supabase/migrations/20261005150000_work_candidate_seed_pw_3.sql';  // 2026-10-05 새 공문(9/22~10/3) 반영

console.log('[① 자리 이름 — 행정실만 접두어가 다르다]');
check('행정실 접두어를 벗긴다', normalizeCandidateSeatName('행정실·지출·급여') === '지출·급여');
check('그 밖의 이름은 그대로', normalizeCandidateSeatName('정보화부장') === '정보화부장');
{
  const byName = new Map([['정보화부장', 's-info'], ['지출·급여', 's-pay']]);
  check('이름이 그대로 맞으면 그대로', resolveCandidateSeatId('정보화부장', byName) === 's-info');
  // ⚠️ 이 한 줄이 없으면 행정실 자리 9개의 후보가 전부 「자리 없음」으로 떨어진다(오류 없음)
  check('행정실은 벗겨서 찾는다', resolveCandidateSeatId('행정실·지출·급여', byName) === 's-pay');
  check('못 찾으면 null(라벨은 호출부가 남긴다)', resolveCandidateSeatId('없는자리', byName) === null);
  check('라벨이 없으면 null', resolveCandidateSeatId(null, byName) === null);
}

console.log('[② 행별 세기 — 셀 수 없는 축은 «0» 이 아니라 «없음»]');
{
  const list = [
    cand({ id: 'a', seat_id: 's1', department: '정보화부' }),
    cand({ id: 'b', seat_id: 's1', department: '정보화부' }),
    cand({ id: 'c', seat_id: 's2', department: '교무운영부' }),
    cand({ id: 'd', seat_id: null, department: null }),
  ];
  const bySeat = countCandidatesByRow(list, 'seat')!;
  check('자리별로 센다', bySeat.get('s1') === 2 && bySeat.get('s2') === 1, [...bySeat]);
  // 2026-09-25: 자리 없는 후보를 «버리지» 않고 미지정 행으로 보낸다(⑦-4 참고)
  check('자리 없는 후보가 남의 자리에 섞이지 않는다', bySeat.get('s1') === 2 && bySeat.get(UNASSIGNED_ROW_KEY) === 1);

  const byDept = countCandidatesByRow(list, 'department')!;
  check('부서별로 센다', byDept.get('정보화부') === 2 && byDept.get('교무운영부') === 1);

  // ⚠️ 0 을 돌려주면 화면이 «후보 0» 을 그려 "후보가 없다"로 읽힌다 — 사실은 "셀 수 없다"이다
  check('업무 축은 null', countCandidatesByRow(list, 'work') === null);
  check('상태 축은 null', countCandidatesByRow(list, 'status') === null);
}

console.log('[③ 행의 후보 고르기]');
{
  const list = [
    cand({ id: 'a', seat_id: 's1', department: '정보화부' }),
    cand({ id: 'b', seat_id: 's2', department: '교무운영부' }),
  ];
  check('자리 축', candidatesForRow(list, 'seat', 's1').map((c) => c.id).join() === 'a');
  check('부서 축', candidatesForRow(list, 'department', '교무운영부').map((c) => c.id).join() === 'b');
  check('셀 수 없는 축은 빈 목록', candidatesForRow(list, 'work', 'w1').length === 0);
}

console.log('[④ 영역으로 묶기]');
{
  const list = [
    cand({ id: 'area1', kind: 'area', name: '정보화', area_name: '정보화' }),
    cand({ id: 'w1', name: '나이스', area_name: '정보화' }),
    cand({ id: 'w2', name: '보안', area_name: '정보화' }),
    cand({ id: 'w3', name: '떠도는 것', area_name: null }),
  ];
  const groups = groupCandidatesByArea(list);
  const info = groups.find((g) => g.area === '정보화')!;
  check('영역 아래 업무가 모인다', info.works.length === 2 && info.areaCandidate?.id === 'area1');
  // 영역 후보가 없어도 업무가 사라지면 안 된다
  check('영역이 없는 업무도 묶인다', groups.some((g) => g.area === '영역 없음' && g.works.length === 1));
  check('업무 많은 영역이 먼저', groups[0].area === '정보화');
}

console.log('[⑤ 저장 전 다듬기]');
{
  const draft = normalizeCandidateDraft({
    kind: 'work', name: '  이름  ', area_name: '  ', seat_id: '', department: ' 정보화부 ',
    brm: '', work_type: null, scale: '  ', note: '   ',
  });
  // '' 와 null 이 섞이면 필터·그룹이 둘로 갈린다
  check('빈 문자열은 null 이 된다',
    draft.area_name === null && draft.brm === null && draft.scale === null && draft.note === null, draft);
  check('공백을 깎는다', draft.name === '이름' && draft.department === '정보화부');
  check('빈 자리는 null', draft.seat_id === null);
  check('이름이 없으면 막는다', validateCandidateDraft({ ...draft, name: '  ' }) !== null);
  check('이름이 있으면 통과', validateCandidateDraft(draft) === null);
}

console.log('[⑥ 한 줄 요약]');
{
  check('유형·규모·반복·부담을 잇는다',
    candidateSummary(cand({ work_type: '의무', scale: '대', repeat_hint: '매월', load: 41 }))
      === '의무 · 규모 대 · 매월 · 부담 41');
  check('규모 «—» 는 적지 않는다', !candidateSummary(cand({ work_type: '선택', scale: '—' })).includes('—'));
  check('비어 있으면 빈 문자열', candidateSummary(cand({})) === '');
}

console.log('[⑦ 관리자 자리 순서 — 교장 → 교감]');
{
  check('교장이 앞', adminSeatRank('교장') < adminSeatRank('교감'));
  // ⚠️ sort_order 에 기대면 안 된다 — 라이브는 교감(0) → 교장(1) 이다
  const 교장 = { name: '교장', kind: 'admin' as const, sort_order: 1 };
  const 교감 = { name: '교감', kind: 'admin' as const, sort_order: 0 };
  check('저장된 순서를 이긴다', compareDutySeats(교장, 교감) < 0);
  check('종류가 먼저', compareDutySeats(교감, { name: '정보화부장', kind: 'head', sort_order: 0 }) < 0);
}

console.log('[⑦-1 상세 — meta 를 화면이 직접 파지 않는다]');
{
  const rich = cand({
    budget: 87_000_000,
    meta: {
      office: 'admin',
      detail: { slack: { 중앙: 8, 최소: 3, '7일이하': 2 }, methods: [['교데통', 4]], forms: ['서식2호'], bases: ['근거'], requestCount: 41, schoolStepCount: 15, memo: { 요약: 'x' } },
      budget: { total: 87_000_000, spent: 41_000_000, items: [['보안장비', 62_000_000]] },
      supports: [['급식 지원', 12]],
    },
  });
  check('상세를 꺼낸다', candidateDetail(rich)?.requestCount === 41);
  check('사업비를 꺼낸다', candidateBudget(rich)?.total === 87_000_000);
  check('행정실 업무 판정', isAdminOfficeCandidate(rich));
  check('지원한 업무', candidateSupports(rich)[0][0] === '급식 지원');

  const bare = cand({});
  check('상세가 없으면 null', candidateDetail(bare) === null);
  check('사업비가 없으면 null', candidateBudget(bare) === null);
  check('배열 기본값은 빈 배열', candidateSupports(bare).length === 0 && candidateTierCounts(bare).length === 0);
  check('행정실이 아니면 false', !isAdminOfficeCandidate(bare));
  // 칼럼만 있고 meta 가 없는 경우(사람이 나중에 적은 값)도 받아야 한다
  check('칼럼만 있어도 사업비를 준다', candidateBudget(cand({ budget: 5_000_000 }))?.total === 5_000_000);

  // 원 단위는 표에서 못 읽는다
  check('억으로 접는다', formatMoney(840_490_000) === '8.4억');
  check('만으로 접는다', formatMoney(87_000_000) === '8,700만');
  check('작은 값은 원 그대로', formatMoney(3_200) === '3,200원');
}

console.log('[⑦-2 업무 목록 = 재검토 반영 목록(pw) — 행정실이 빠지지 않았는가]');
{
  // 2026-09-28 사용자 결정: artifact 의 두 목록 중 «사람별 업무»(재검토 반영, 235개)가 정본이다.
  // ⚠️ 종전엔 행정실을 `works` 와 따로 세는 모집단을 빠뜨려 행정실 자리 9개가 비었다 — 새 목록은
  //    한 목록에 담지만, 행정실 판정(`office`)이 빠지면 같은 구멍이 다시 난다.
  const source = JSON.parse(readFileSync('scripts/work-candidate-seed/source-2026.json', 'utf8'));
  check('원본이 새 목록이다', source.catalog === 'pw');
  check(`업무 241 — ${source.works.length}`, source.works.length === 241);  // 2026-10-05: 새 공문으로 단일 공문 업무 6개 추가(사라진 업무 0)
  const admin = source.works.filter((w: { office: string }) => w.office === 'admin').length;
  check(`행정실 업무가 있다 — ${admin}`, admin >= 26, admin);
  // 이어받은 값 — 이름이 같거나 RENAMES 로 이은 옛 업무에서
  // 2026-09-28 2차 판: 「재정결함보조금」 상세가 옛 이름으로만 적혀 있어 RENAMES 로 이어 20개가 됐다
  check('공문 본문 상세 20개를 모두 이어받았다',
    source.works.filter((w: { carried: { detail: unknown } | null }) => w.carried?.detail).length === 20);
  check('사업비 49개를 모두 이어받았다',
    source.works.filter((w: { carried: { budget: unknown } | null }) => w.carried?.budget).length === 49);
  // 공문 제목은 계속 담지 않는다(학생·기관 이름)
  const detailJson = JSON.stringify(source.works.map((w: { carried: { detail: unknown } | null }) => w.carried?.detail));
  check('상세에 공문 제목 배열을 담지 않는다',
    !detailJson.includes('"요구"') && !detailJson.includes('"학교절차"'));
  // ⚠️ artifact 는 분장 자리가 없으면 빈 문자열을 준다 — 그대로면 「자리 못 찾음」 36건이 된다
  check('빈 자리 이름은 null 이다', source.works.every((w: { seat: string | null }) => w.seat !== ''));
  // 코드는 이름 해시 — 옛 위치 코드(W086)는 판마다 다른 업무를 가리켰다
  check('코드가 이름 해시(P…)다', source.works.every((w: { code: string }) => /^P[0-9a-f]{8}$/.test(w.code)));
  check('코드가 겹치지 않는다', new Set(source.works.map((w: { code: string }) => w.code)).size === source.works.length);

  const seed = readFileSync(SEED, 'utf8');
  check('시드가 사업비·근거 칼럼을 채운다', /counts, meta, budget, evidence/.test(seed));
  check('시드가 옛 artifact 업무 행을 지운다', /delete from public\.work_candidate[\s\S]*?code not in \(/.test(seed));
  check('사람이 만든 후보(code 없음)는 지우지 않는다', /code is not null\s+and code not in/.test(seed));
}

console.log('[⑦-3 예산은 «정확한 항목 이름»으로 갈라 보여 준다]');
{
  check('사업 > 항목을 가른다',
    splitBudgetName('학교급식운영>급식재료구입비').program === '학교급식운영'
      && splitBudgetName('학교급식운영>급식재료구입비').item === '급식재료구입비');
  check('구분자가 없으면 통째로 항목', splitBudgetName('급식비').program === null);

  const 급식 = cand({
    id: 'a', name: '학교급식 운영·무상급식·우유급식',
    meta: { budget: { total: 840_490_000, spent: 0, items: [
      ['학교급식운영>급식재료구입비', 748_741_000, true],
      ['학교급식운영>급식운영비', 73_393_000, true],
    ] } },
  });
  // ⚠️ 뭉뚱그린 업무 이름 하나가 실제로는 여러 항목이다 — 합계만 보이면 어느 돈인지 모른다
  check('항목을 자르지 않는다', budgetItemsOf(급식).length === 2);

  // 한 업무 안에 같은 이름이 두 줄 이상(라이브 9건) — 이름으로 합치면 예산서와 대조가 안 된다
  const 농구부 = cand({
    id: 'b',
    meta: { budget: { total: 14_600_000, spent: 0, items: [
      ['교기운영>농구부운영', 2_400_000, true],
      ['교기운영>농구부운영', 7_500_000, true],
    ] } },
  });
  check('같은 항목명 두 줄을 합치지 않는다', budgetItemsOf(농구부).length === 2);

  // ⚠️ 같은 예산이 교무실·행정실 두 업무에 붙는다(라이브 8개 항목 9.5억 = 단순합의 33%)
  const 행정실급식 = cand({
    id: 'c', name: '급식 식재료 계약·식생활관 운영',
    meta: { office: 'admin', budget: { total: 840_490_000, spent: 0, items: [
      ['학교급식운영>급식재료구입비', 748_741_000, true],
    ] } },
  });
  const shared = sharedBudgetKeys([급식, 행정실급식, 농구부]);
  check('겹친 항목을 찾는다', shared.has('학교급식운영>급식재료구입비|748741000'), [...shared]);
  check('겹치지 않은 항목은 표시하지 않는다', !shared.has('교기운영>농구부운영|2400000'));
  check('후보가 하나면 겹침이 없다', sharedBudgetKeys([급식]).size === 0);

  // 「짐작」 표시가 살아 있는가 — 87개 중 25개가 산출내역 낱말로 붙인 값이다
  const 짐작 = cand({ meta: { budget: { total: 1, spent: 0, items: [['체육 교과활동>교과운영', 1_200_000, false]] } } });
  check('확인/짐작 표시를 담는다', budgetItemsOf(짐작)[0][2] === false);
  check('확인은 true', budgetItemsOf(급식)[0][2] === true);

  // 원본이 플래그를 잃지 않았는가(추출기가 세 번째 값을 버린 적이 있다)
  const source = JSON.parse(readFileSync('scripts/work-candidate-seed/source-2026.json', 'utf8'));
  const allItems = source.works.flatMap((w: { carried: { budget: { items: [string, number, boolean][] } | null } | null }) => w.carried?.budget?.items ?? []);
  check('원본 항목에 확인 여부가 있다', allItems.every((it: unknown[]) => typeof it[2] === 'boolean'), allItems[0]);
  check('짐작이 실제로 섞여 있다', allItems.some((it: unknown[]) => it[2] === false));
}

console.log('[⑦-3b «사업 이름이 특정되지 않습니다» 경고는 걷어냈다 (2026-09-25 사용자 결정)]');
{
  // 답은 추론할 것이 아니라 `meta.budget_notices` 에 이미 있다. 경고·조각 수·형제 소거법
  // 셋을 전부 지웠고, **오류 없이 되살아나는 부류**라 정적 검사로 못 박는다.
  const lib = readFileSync('src/lib/workCandidates.ts', 'utf8');
  for (const gone of ['budgetNameIsSpecific', 'splitMergedName', 'budgetProgramOwners']) {
    check(`${gone} 이 다시 생기지 않았다`, !new RegExp(`export function ${gone}\b`).test(lib));
  }
  const dialogRaw = readFileSync('src/components/tasks/WorkCandidateDialog.tsx', 'utf8');
  // ⚠️ 주석을 먼저 벗긴다 — 되살리지 말라는 **주석 자체가** 그 문구를 담고 있어서,
  //    날것으로 검사하면 «지웠는데도 실패»한다(실제로 그렇게 한 번 걸렸다).
  const dialog = dialogRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('«사업 이름이 특정되지 않습니다» 문구가 없다', !dialog.includes('특정되지 않습니다'));
  check('[이름 고치기] 버튼이 없다', !dialog.includes('이름 고치기'));
  check('«과목으로는 사업을 가릴 수 없습니다» 안내가 없다', !dialog.includes('가릴 수 없습니다'));
  check('되살리지 말라는 주석은 남아 있다', dialogRaw.includes('되살리지 말 것'));
  // 남아야 하는 것 — 「겹침」은 사업 이름 추론이 아니라 «합산 금지»라는 다른 뜻이다
  check('겹침 표시는 남는다', /sharedBudgetKeys/.test(dialog) && dialog.includes('겹침'));
  // 예산 칸의 공문 목록은 남되 «들어온 돈»으로 좁혔다(발신은 아래 전용 목록이 전부 보여 준다)
  check('돈이 들어온 공문 목록은 남는다', dialog.includes('이 돈이 들어온 공문'));
  check('근거 문서 목록이 있다', dialog.includes('근거 문서'));
}

console.log('[⑦-3d 담당·근거 문서 — 분장표와 문서가 가리키는 사람 (2026-09-28)]');
{
  // ── 근거 등급 순서 — 문서가 «위치»로 등급을 가리킨다. 어긋나면 기안이 안내로 보인다(오류 없이)
  const extractSrc = readFileSync('scripts/work-candidate-seed/extract.mts', 'utf8');
  const expected = extractSrc.match(/const EXPECTED_TIERS = (\[[^\]]+\])/)?.[1];
  check('등급 순서가 추출기와 같다',
    expected !== undefined && JSON.stringify(JSON.parse(expected.replace(/'/g, '"'))) === JSON.stringify(EVIDENCE_TIERS.map((t) => t.key)),
    expected);
  check('등급 라벨', evidenceTierLabel(0) === '기안·보고' && evidenceTierLabel(99) === '—');

  // ── 담당 네 갈래
  const withSeat = (owner: Record<string, unknown>) =>
    cand({ seat_label: '생활선교부장', meta: { owner: { seatPeople: ['신유찬'], top: '신유찬', grade: '입증', same: false, subject: false, people: [], ...owner } } });
  check('분장과 같음', ownerMatchOf(withSeat({ same: true })) === 'same');
  check('교과 업무', ownerMatchOf(withSeat({ subject: true })) === 'subject');
  check('분장과 다름', ownerMatchOf(withSeat({})) === 'different');
  check('자리가 없으면 «분장 자리 없음» — same 값과 무관하게',
    ownerMatchOf(cand({ seat_label: null, meta: { owner: { same: true } } })) === 'no-seat');
  check('owner 가 없으면 null', ownerMatchOf(cand({})) === null && candidateOwner(cand({})) === null);

  // ── 근거 칸 해석 — 모양이 어긋난 줄은 버린다(화면이 죽지 않게)
  const docs = parseEvidence([
    { date: '03-05', dir: 1, tier: 0, title: '프로그램 개설 가정통신문', who: ['류로아'] },
    { date: '04-01', dir: 0, tier: 6, title: null, who: [] },
    { date: 3, tier: 0, who: [] },
    null,
  ]);
  check('모양이 맞는 줄만 남는다', docs.length === 2);
  check('가린 제목은 null 로 남는다(빈 문자열이 아니다)', docs[1].title === null);
  check('배열이 아니면 빈 목록', parseEvidence({}).length === 0 && parseEvidence(null).length === 0);

  // ── 이전 이름 — 이름이 바뀐 경우만
  check('이름이 바뀌면 이전 이름', candidateRenamedFrom(cand({ name: '새', meta: { carried_from: '옛' } })) === '옛');
  check('같은 이름이면 null', candidateRenamedFrom(cand({ name: '같음', meta: { carried_from: '같음' } })) === null);

  // ── 예산 칸은 «들어온 돈»만 — 옛 발신 목록이 없어져 행위 이름으로 가른다
  const both = cand({ meta: { budget_notices: [
    { date: '03-20', kind: '교부', title: '운영비 교부' },
    { date: '05-20', kind: '회계', title: '지출품의: 교구 구입' },
    { date: '06-01', kind: '내부결재', title: '운영 계획' },
  ] } });
  const incoming = candidateIncomingBudgetNotices(both);
  check('우리가 쓴 것(회계·내부결재)은 예산 칸에서 뺀다', incoming.length === 1 && incoming[0].kind === '교부', incoming);
  check('발신 행위 셋', OUTGOING_NOTICE_KINDS.size === 3 && OUTGOING_NOTICE_KINDS.has('대외 보고'));

  // ── 원본 실측 — 이 값들이 흔들리면 추출이 바뀐 것이다
  const source = JSON.parse(readFileSync('scripts/work-candidate-seed/source-2026.json', 'utf8'));
  type SrcWork = {
    name: string; seat: string | null;
    owner: { same: boolean; subject: boolean; people: [string, string, number, boolean][] };
    counts: { docs: number };
    tierCounts: number[];
    evidence: { dir: number; tier: number; title: string | null; who: string[] }[];
    carried: { from: string; renamed: boolean } | null;
  };
  const works = source.works as SrcWork[];
  const docTotal = works.reduce((n, w) => n + w.counts.docs, 0);
  check(`근거 문서 9,734건 — ${docTotal}`, docTotal === 9734);  // 3/3~10/3
  // ⚠️ 등급별 합 = 문서 수 — 등급 위치가 어긋나면 여기서 먼저 틀어진다
  check('등급별 합이 문서 수와 같다', works.every((w) => w.tierCounts.reduce((a, b) => a + b, 0) === w.counts.docs));
  check('모든 업무에 근거가 있다', works.every((w) => w.evidence.length > 0));
  // 같은 문서가 기안자·담당자 두 사람 밑에 온 것을 한 줄로 합쳤다 — 사람은 모은다
  const lines = works.reduce((n, w) => n + w.evidence.length, 0);
  check(`합친 뒤 줄 수가 문서 수보다 적다 — ${lines}`, lines < docTotal);
  check('두 사람이 다룬 줄이 있다', works.some((w) => w.evidence.some((d) => d.who.length > 1)));
  // ⚠️ 교대한 자리는 그 날짜의 실제 사람으로 푼다 — 「류로아 → 소혜신 → 장재윤」로 뭉뚱그리지 않는다
  check('근거의 사람 이름에 교대 화살표가 남지 않는다',
    works.every((w) => w.evidence.every((d) => d.who.every((p) => !p.includes('→')))));
  check('가린 제목이 있다(null 로 보존)', works.some((w) => w.evidence.some((d) => d.title === null)));
  // 담당 네 갈래 실측 — artifact 「업무별 담당」과 같아야 한다
  const same = works.filter((w) => w.owner.same).length;
  const diff = works.filter((w) => w.seat && !w.owner.same && !w.owner.subject).length;
  const noSeat = works.filter((w) => !w.seat).length;
  check(`분장과 같음 169 · 다름 24 · 자리 없음 44 — ${same}·${diff}·${noSeat}`, same === 169 && diff === 24 && noSeat === 44);
  // 옛 이름으로만 남은 값을 RENAMES 로 잇는다 — 공문 본문 상세(deep)만 옛 이름인 경우
  const subsidy = works.find((w) => w.name === '재정결함보조금 신청·교부·정산') as SrcWork & { carried: { detail: unknown } | null };
  check('「사립학교 재정결함보조금 (월별…)」 상세 → 새 이름으로 이어받음', Boolean(subsidy?.carried?.detail), subsidy?.carried);
  // artifact 가 사업비·첫 카탈로그를 재검토 이름으로 다시 적었다 — 새 이름으로 바로 찾는다
  const exam = works.find((w) => w.name === '정기시험·학생평가·학업성적관리') as SrcWork & { carried: { budget: unknown; detail: unknown } | null };
  check('「정기시험·학생평가·학업성적관리」 사업비·상세를 새 이름으로 찾는다',
    Boolean(exam?.carried?.budget && exam.carried.detail));

  // ── 옛 모델의 잔재가 되살아나지 않는다 (오류 없이 되살아나는 부류)
  check('원본에 옛 공문 근거(notices)가 없다', !('notices' in works[0]));
  check('추출기에 재배정 표(NOTICE_MOVES)가 없다', !/const NOTICE_MOVES/.test(extractSrc));
  check('추출기에 자리 고침(SEAT_OVERRIDES)이 없다', !/const SEAT_OVERRIDES/.test(extractSrc));
  check('사라진 옛 업무는 RENAMES·INTENTIONALLY_DROPPED 에 적혀 있어야 죽지 않는다',
    /사라진 옛 업무가 RENAMES·INTENTIONALLY_DROPPED 어디에도 없음/.test(extractSrc));

  // ── 근거는 목록 조회에서 뺀다 — 넣으면 지도를 열 때마다 400KB 를 받는다
  const hook = readFileSync('src/hooks/useWorkCandidates.ts', 'utf8');
  const listCols = hook.match(/const LIST_COLUMNS = \[([\s\S]*?)\]/)?.[1] ?? '';
  check('목록 조회가 칼럼을 명시한다', /\.select\(LIST_COLUMNS/.test(hook) && !/\.select\('\*'/.test(hook));
  check('목록 칼럼에 evidence 가 없다', listCols.length > 0 && !listCols.includes('evidence'));
  check('목록 칼럼에 meta 는 있다(담당·등급 칩이 쓴다)', listCols.includes("'meta'"));

  // ── 화면 — 사람별 화면은 만들지 않는다(사람 축 기각 결정)
  const dialogRaw = readFileSync('src/components/tasks/WorkCandidateDialog.tsx', 'utf8');
  const dialog = dialogRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('담당 패널이 있다', dialog.includes('<OwnerPanel'));
  check('근거는 펼칠 때 읽는다', dialog.includes('useWorkCandidateEvidence(candidate.id)'));
  check('가린 제목을 «제목 가림»으로 말한다', dialog.includes('(제목 가림)'));
  check('옛 공문 목록이 남지 않았다', !dialog.includes('우리가 보낸 공문') && !dialog.includes('받은 공문'));
  // ⚠️ 다름을 경고 색으로 칠하지 않는다 — 재검토에서 다름은 갱신·이관·협력으로 갈렸다
  const chip = dialog.slice(dialog.indexOf('function OwnerMatchChip'), dialog.indexOf('function OwnerPanel'));
  check('담당 칩에 로즈·앰버를 쓰지 않는다', chip.length > 0 && !/rose-|amber-|red-/.test(chip));
}

console.log('[⑦-3c 사업 이름은 «예산 관련 공문»에 있다]');
{
  // 2026-09-25: "artifact 에 관련 정보가 없는건가?" → 있었다. 공문 단계를 통째로 버리면서 빠졌다.
  const c = cand({ meta: { budget_notices: [
    { date: '03-20', kind: '교부', title: '2026년 AI 중점학교 운영비 교부' },
  ] } });
  check('예산 관련 공문을 꺼낸다', candidateBudgetNotices(c)[0].title.includes('AI 중점학교'));
  check('없으면 빈 배열', candidateBudgetNotices(cand({})).length === 0);

  const source = JSON.parse(readFileSync('scripts/work-candidate-seed/source-2026.json', 'utf8'));
  type SrcWork = { name: string; carried: { budget: unknown; budgetNotices: { kind: string; title: string }[] } | null };
  const bn = (w: SrcWork) => w.carried?.budgetNotices ?? [];
  const withNotices = source.works.filter((w: SrcWork) => bn(w).length);
  check(`예산 업무 38개에 공문이 붙는다 — ${withNotices.length}`, withNotices.length === 38);
  const total = source.works.reduce((n: number, w: SrcWork) => n + bn(w).length, 0);
  check(`공문 제목 150건 — ${total}`, total === 150);

  // ⚠️ 2026-09-25 회귀: 낱말 목록이 좁아 「구입 지원」·「지원사업」을 놓쳤다.
  //    사용자가 그 200만원이 «교구구입 지원사업» 이라고 알려 줘서 드러났다.
  // ⚠️ 2차 판에 「AIEP(전북형 AI 교수학습 플랫폼)」이 새로 생겼다 — 접두어로 찾으면 그쪽이 걸린다
  const aiep = source.works.find((w: SrcWork) => w.name === 'AIEP·에듀테크·AI 교육 연수와 공모');
  check('교구 구입 공문을 잡는다',
    bn(aiep).some((n) => n.title.includes('교구') && n.title.includes('구입')),
    bn(aiep).map((n) => n.title));
  check('지원사업도 잡는다', bn(aiep).some((n) => n.title.includes('지원사업')));
  // 강한 신호(교부)가 있으면 먼저 남는다 — 6개만 담으므로 무엇을 남기느냐가 곧 쓸모다
  // 이름이 바뀐 업무(학교스포츠클럽·학교체육 사업 → …체육(아침운동 등))도 공문을 이어받았다
  const sports = source.works.find((w: SrcWork) => w.name.includes('학교스포츠클럽'));
  check('교부 공문이 남는다(이름이 바뀐 업무로 이어받음)',
    bn(sports).filter((n) => n.kind === '교부').length >= 3,
    bn(sports).map((n) => `${n.kind} ${n.title}`));
  check('예산이 없으면 공문도 없다',
    source.works.every((w: SrcWork) => w.carried?.budget || bn(w).length === 0));
}

console.log('[⑦-6 절차 검토 — 사람 × 업무 (2026-09-29 사용자 요청)]');
{
  // 판독기 — 모양이 어긋난 줄은 버리고, 절차가 먼저 온다
  const list = parseProcedures([
    { person: 'A', kind: '일회성', summary: '한 번', steps: [], related: [] },
    { person: 'B', kind: '절차', summary: '둘', steps: [{ name: '계획', by: null, docs: [] }, { name: '결과', by: null, docs: [] }], related: [] },
    { person: 'C', kind: '없는종류', summary: 'x' },
    { person: 'D', kind: '절차', summary: '셋', steps: [{}, {}, {}] },
    null,
  ]);
  check('모양이 맞는 줄만 남는다', list.length === 3, list.map((e) => e.person));
  check('steps·related 가 없으면 빈 배열로 채운다', list.find((e) => e.person === 'D')!.related.length === 0);
  const sorted = sortProcedures(list);
  check('절차가 먼저, 같은 종류면 단계 많은 순', sorted.map((e) => e.person).join() === 'D,B,A', sorted.map((e) => e.person));
  check('종류는 넷', PROCEDURE_KINDS.join() === '절차,반복,일회성,참고');
  check('요약이 없으면 null', candidateProcedureSummary(cand({})) === null);

  // 검증기가 지키는 것 — 근거 id 가 실재하고 쌍의 문서인지(지어낸 근거는 여기서 걸린다)
  const validator = readFileSync('scripts/work-procedure-review/validate.mts', 'utf8');
  check('검증기가 없는 문서 id 를 잡는다', validator.includes('없는 문서 #'));
  check('검증기가 남의 업무 문서를 제 단계로 쓴 것을 잡는다', validator.includes('이 쌍의 문서가 아님'));
  check('검증기가 빠진 쌍을 잡는다', validator.includes('빠진 쌍'));

  // 시드 — 절차 본문은 칼럼, 목록에는 요약만. 검토 파일 없이 돌려도 검토가 지워지지 않는다
  const buildSql = readFileSync('scripts/work-candidate-seed/build-sql.mts', 'utf8');
  check('시드가 procedures 칼럼을 채운다', /counts, meta, budget, evidence, procedures/.test(buildSql));
  check('검토 파일이 없어도 기존 검토를 지우지 않는다', /coalesce\(excluded\.procedures, public\.work_candidate\.procedures\)/.test(buildSql));
  const hook = readFileSync('src/hooks/useWorkCandidates.ts', 'utf8');
  const listCols = hook.match(/const LIST_COLUMNS = \[([\s\S]*?)\]/)?.[1] ?? '';
  check('목록 칼럼에 procedures 가 없다(펼칠 때만)', !listCols.includes('procedures'));
  const dialogRaw = readFileSync('src/components/tasks/WorkCandidateDialog.tsx', 'utf8');
  const expandedAt = dialogRaw.indexOf('<ProcedurePanel candidate={candidate} />');
  check('서랍을 펼치면 절차 패널이 가장 먼저', expandedAt > 0 && expandedAt < dialogRaw.indexOf('<CandidateDetailPanel candidate={candidate} />'));
}

console.log('[⑦-7 일회성 분석 — 행위·부담 · 누구의 일 · 올릴 만한가 (2026-09-29)]');
{
  const proc = JSON.parse(readFileSync('scripts/work-candidate-seed/procedures-2026.json', 'utf8')) as {
    works: Record<string, { kind: string; once?: Record<string, unknown> }[]>;
  };
  const onceEntries = Object.values(proc.works).flat().filter((e) => e.kind === '일회성');
  check(`일회성 전부에 분석이 붙었다 — ${onceEntries.filter((e) => e.once).length}/${onceEntries.length}`,
    onceEntries.length > 0 && onceEntries.every((e) => e.once));
  check('일회성이 아닌 항목에는 분석이 없다', Object.values(proc.works).flat().every((e) => e.kind === '일회성' || !e.once));
  // ⚠️ «해마다 돌아오는가»는 사용자 결정으로 나중에 — 추정이 저장되면 화면이 확정처럼 보여 준다
  check('연례 추정(annual)이 저장되지 않았다', onceEntries.every((e) => !('annual' in (e.once ?? {}))));
  const merge = readFileSync('scripts/work-procedure-review/merge-once.mts', 'utf8');
  check('병합기가 annual 을 싣지 않는다', !/annual:\s/.test(merge.replace(/\/\*[\s\S]*?\*\//g, '')));
  const lib = readFileSync('src/lib/workCandidates.ts', 'utf8');
  const onceType = lib.slice(lib.indexOf('export interface OnceAnalysis'), lib.indexOf('}', lib.indexOf('export interface OnceAnalysis')));
  check('OnceAnalysis 타입에 annual 이 없다', onceType.length > 0 && !onceType.includes('annual'));
  // 분류 오류는 «맞는 업무»가 실제 업무 이름이어야 한다(검증기가 색인과 대조했다)
  const src = JSON.parse(readFileSync('scripts/work-candidate-seed/source-2026.json', 'utf8'));
  const names = new Set((src.works as { name: string }[]).map((w) => w.name));
  const misfiled = onceEntries.filter((e) => e.once?.owner === '분류 오류');
  check(`분류 오류 ${misfiled.length}건의 옮길 업무가 실제 후보 이름이다`, misfiled.every((e) => names.has(String(e.once?.ownerWork))));
  // 병합 순서 — merge.mts 가 파일을 새로 쓰므로 그 뒤에 merge-once.mts 를 돌려야 한다
  check('merge.mts 가 다음 단계(merge-once)를 안내한다', readFileSync('scripts/work-procedure-review/merge.mts', 'utf8').includes('merge-once.mts'));
}

console.log('[⑦-4 자리·부서가 없는 후보도 화면에 닿는다]');
{
  // ⚠️ 2026-09-25 이전엔 `continue` 라 57건(자리 없음)이 어느 행에도 없이 사라졌다
  const list = [
    cand({ id: 'a', seat_id: 's1', department: '정보화부' }),
    cand({ id: 'b', seat_id: null, department: '행정실' }),
    cand({ id: 'c', seat_id: null, department: null }),
  ];
  const bySeat = countCandidatesByRow(list, 'seat')!;
  check('자리 없는 후보는 «분장 자리 없음» 으로', bySeat.get(UNASSIGNED_ROW_KEY) === 2, [...bySeat]);
  check('자리 축 합계가 전부', [...bySeat.values()].reduce((n, v) => n + v, 0) === list.length);

  const byDept = countCandidatesByRow(list, 'department')!;
  check('부서 없는 후보는 «부서 없음» 으로', byDept.get(UNKNOWN_ROW_KEY) === 1, [...byDept]);
  check('부서 축 합계도 전부', [...byDept.values()].reduce((n, v) => n + v, 0) === list.length);

  check('미지정 행을 열면 그 후보들이 나온다',
    candidatesForRow(list, 'seat', UNASSIGNED_ROW_KEY).map((c) => c.id).join() === 'b,c');
  check('부서 미지정도 마찬가지',
    candidatesForRow(list, 'department', UNKNOWN_ROW_KEY).map((c) => c.id).join() === 'c');
  // 키가 `workPivot` 과 어긋나면 오류 없이 «후보 0» 이 된다
  check('미지정 키가 지도와 같다', UNASSIGNED_ROW_KEY === '__no_seat__' && UNKNOWN_ROW_KEY === '__none__');
}

console.log('[⑦-5 저장했는데 안 그리던 것 — 이제 그린다]');
{
  const c = cand({ counts: { people: 14, docs: 87 }, meta: { first: '2026-03-04', last: '2026-09-18' } });
  check('문서 기간', candidatePeriod(c).first === '2026-03-04' && candidatePeriod(c).last === '2026-09-18');
  check('문서 수는 counts 에서(근거 본문은 목록에 없다)', candidateDocCount(c) === 87);
  const bare = cand({});
  check('없으면 null·0', candidatePeriod(bare).first === null && candidateDocCount(bare) === 0);
}

console.log('[⑧ 시드는 사람의 수정을 되돌리지 않는다]');
{
  const seed = readFileSync(SEED, 'utf8');
  check('다시 넣으면 갱신된다(중복 아님)', seed.includes('on conflict (academic_year, kind, code)'));
  // ⚠️ 결합(||)이면 옛 카탈로그 키(notices·seat_check)가 유령으로 남는다
  check('meta 는 교체한다(결합이 아니다)', /\n  meta\s*=\s*excluded\.meta,/.test(seed));
  check('근거 칼럼을 갱신한다', /evidence\s*=\s*excluded\.evidence/.test(seed));
  // ⚠️ 이름·메모까지 덮으면 "수정 가능"이 다음 시드에서 거짓말이 된다
  check('이름을 덮지 않는다', !/do update set[\s\S]*?\n  name\s*=/.test(seed));
  check('메모를 덮지 않는다', !/do update set[\s\S]*?\n  note\s*=/.test(seed));
  check('분석값은 갱신한다', /do update set[\s\S]*?load\s*=\s*excluded\.load/.test(seed));
  check('자리는 이름으로 잇는다(uuid 를 박지 않는다)', seed.includes('s.name = c.seat_name'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
