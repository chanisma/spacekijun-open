import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { upcomingStudentRounds, readStudentCourseHome, readStudentSeatHome, reservationPeriodLabel, activeStudentPurchasePages, parseHomeIpsiPosts, type HomePurchasePage, type HomeRound } from '../studentHomeData';

const now = new Date('2026-09-09T12:00:00+09:00');
const scope = { studentCode: '26-test', grade: 1, admissionYear: 2026 };
const round = (overrides: Partial<HomeRound> = {}): HomeRound => ({
  id: 'round-1', title: '신청', round_number: 1, status: 'open', target_grade: 1,
  admission_year: null, opens_at: null, closes_at: null, ...overrides,
});

test('입학연도 지정이 학년보다 우선하며 다른 입학연도·학년은 제외한다', () => {
  const rows = [round({ id: 'admission', admission_year: 2026, target_grade: 2 }),
    round({ id: 'other-admission', admission_year: 2025 }), round({ id: 'other-grade', target_grade: 2 }), round({ id: 'all', target_grade: null })];
  assert.deepEqual(upcomingStudentRounds(rows, scope, now).map((row) => row.id), ['admission', 'all']);
});

test('학년·입학연도를 모르면 대상 제한 차수를 표시하지 않는다', () => {
  assert.equal(upcomingStudentRounds([round(), round({ admission_year: 2026 })], { ...scope, grade: null, admissionYear: null }, now).length, 0);
  assert.equal(upcomingStudentRounds([round({ target_grade: null })], { ...scope, studentCode: '' }, now).length, 0);
});

test('초안·종료·잘못된 날짜는 제외하고 공개된 예정 신청은 남긴다', () => {
  const rows = [round({ status: 'draft' }), round({ status: 'closed' }), round({ status: 'archived' }),
    round({ closes_at: '2026-09-09T11:59:59+09:00' }), round({ opens_at: 'invalid' }),
    round({ closes_at: 'invalid' }), round({ opens_at: '2026-09-11', closes_at: '2026-09-10' }),
    round({ id: 'future', opens_at: '2026-09-10', closes_at: '2026-09-11' })];
  assert.deepEqual(upcomingStudentRounds(rows, scope, now).map((row) => row.id), ['future']);
});

test('가까운 마감순으로 정렬하며 마감 직후에는 사라진다', () => {
  const rows = [round({ id: 'no-deadline' }), round({ id: 'later', closes_at: '2026-09-10T12:00:00+09:00' }),
    round({ id: 'now', closes_at: now.toISOString() })];
  assert.deepEqual(upcomingStudentRounds(rows, scope, now).map((row) => row.id), ['now', 'later', 'no-deadline']);
  assert.equal(upcomingStudentRounds([rows[2]], scope, new Date(now.getTime() + 1)).length, 0);
});

type Call = { table: string; method: string; args: unknown[] };
function mockClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const client = { from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return query; };
    }
    query.then = (resolve: (value: unknown) => void) => Promise.resolve(responses[table]).then(resolve);
    return query;
  } } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

test('예약은 본인 계정·7일 범위·최대 7행으로 조회하며 민감한 출결 피드백은 읽지 않는다', async () => {
  const { client, calls } = mockClient({ seat_reservations: { data: [], error: null } });
  await readStudentSeatHome(client, 'own-profile', '2026-09-09', '2026-09-15');
  for (const [method, args] of [['eq', ['student_id', 'own-profile']], ['gte', ['reservation_date', '2026-09-09']],
    ['lte', ['reservation_date', '2026-09-15']], ['limit', [7]]] as const) {
    assert.ok(calls.some((call) => call.method === method && JSON.stringify(call.args) === JSON.stringify(args)));
  }
  assert.doesNotMatch(String(calls.find((call) => call.method === 'select')?.args[0]), /feedback|checked_by|\*/);
});

test('학생 식별자가 없으면 데이터 요청 자체를 하지 않는다', async () => {
  const { client, calls } = mockClient({});
  await assert.rejects(readStudentSeatHome(client, '', '2026-09-09', '2026-09-15'));
  await assert.rejects(readStudentCourseHome(client, { ...scope, studentCode: '' }));
  assert.equal(calls.length, 0);
});

test('신청 저장 내역은 본인과 대상 차수로 제한하고 완료 여부를 추측하지 않는다', async () => {
  const { client, calls } = mockClient({
    course_selection_round: { data: [round(), round({ id: 'other', target_grade: 2 })], error: null },
    course_selection_submission: { data: [{ round_id: 'round-1' }], error: null },
  });
  const result = await readStudentCourseHome(client, scope);
  assert.deepEqual(result.savedRoundIds, ['round-1']);
  assert.ok(calls.some((call) => call.table === 'course_selection_submission' && call.method === 'eq' && call.args[0] === 'student_code' && call.args[1] === scope.studentCode));
  assert.deepEqual(calls.find((call) => call.method === 'in')?.args, ['round_id', ['round-1']]);
  assert.ok(!('completed' in result));
});

test('조회 실패는 빈 목록으로 숨기지 않고 오류로 전달한다', async () => {
  const error = new Error('permission denied');
  const { client } = mockClient({ seat_reservations: { data: null, error }, course_selection_round: { data: null, error } });
  await assert.rejects(readStudentSeatHome(client, 'own-profile', '2026-09-09', '2026-09-15'), error);
  await assert.rejects(readStudentCourseHome(client, scope), error);
});

test('자습 시간은 열람실 설정을 사용하고 교시가 없는 예약은 시간을 지어내지 않는다', () => {
  assert.equal(reservationPeriodLabel(1, [{ id: 1, name: '야간 1교시', start_time: '18:40', end_time: '20:10' }]), '야간 1교시 · 18:40–20:10');
  assert.equal(reservationPeriodLabel(null, []), '교시 구분 없음');
  assert.equal(reservationPeriodLabel(3, null), '3교시');
});

test('구매 신청은 학생 대상·신청 기간 중·미보관 항목만 표시한다', () => {
  const base: HomePurchasePage = { id: 'open', title: '구매', description: null, target_roles: ['student'], is_archived: false, period_start: '2026-09-01', period_end: '2026-09-30' };
  assert.deepEqual(activeStudentPurchasePages([base, { ...base, id: 'teacher', target_roles: ['teacher'] },
    { ...base, id: 'archived', is_archived: true }, { ...base, id: 'future', period_start: '2026-09-10' },
    { ...base, id: 'ended', period_end: '2026-09-08' }, { ...base, id: 'invalid', period_end: 'bad' }], now).map((page) => page.id), ['open']);
  assert.equal(activeStudentPurchasePages([{ ...base, period_end: now.toISOString() }], now).length, 1);
  assert.equal(activeStudentPurchasePages([{ ...base, period_end: now.toISOString() }], new Date(now.getTime() + 1)).length, 0);
});

test('입시 피드의 서버 정렬을 유지해 5개만 표시하고 실행 가능한 URL은 제거한다', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: String(i), title: `글 ${i}`, url: i === 0 ? 'javascript:alert(1)' : 'https://example.com/news', sort_date: '2026-09-09', kind: 'news' }));
  const posts = parseHomeIpsiPosts({ items });
  assert.deepEqual(posts.map((post) => post.id), ['0', '1', '2', '3', '4']);
  assert.equal(posts[0].url, null);
  assert.equal(posts[1].url, 'https://example.com/news');
  assert.deepEqual(parseHomeIpsiPosts(null), []);
});
