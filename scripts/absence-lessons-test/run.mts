/**
 * 결강 처리(출장·개인일정 ↔ 수업 교체·대체) 회귀 테스트
 *
 * 실행: npx tsx scripts/absence-lessons-test/run.mts
 *
 * 검증 목적
 *  1) 교시 겹침은 **조금이라도** 겹치면 걸린다 — 경계는 반열린 구간(10:00 까지면 2교시 아님)
 *  2) 여러 날 일정은 다루지 않는다 — 끝이 다음 날이면 시작일 하루로 자른다
 *  3) 처리 상태는 **저장하지 않고** 그날·그 교시의 내 요청에서 계산한다
 *     - 승인돼 시간표에서 빠진 수업도 목록에 남는다(안 그러면 "처리 1/3" 이 "0/2" 가 된다)
 *     - 대기가 거절보다 우선, 승인이 대기보다 우선
 *  4) ⚠ 개인일정의 제목·내용은 요청 사유에 실리지 않는다 (사용자 결정)
 *  5) 교체 상대 날짜: 결강 구간 안의 칸은 막고, 결강이 먼 미래여도 그 주 근처에서 고른다
 *  6) 정적 — 신청 모달 두 개가 결강 출처를 meta 에 남기는가, 거절이 meta 를 덮어쓰지 않는가,
 *     호스트가 한 번만 마운트되는가, 남에게 보내는 알림에 .select() 가 없는가
 *
 * 이 부류는 오류 없이 틀린다(상태가 어긋나도 화면은 멀쩡히 그려진다) — 정적 검사가 방어선이다.
 */
import { readFileSync } from 'node:fs';
import {
  absenceApproverDateOptions,
  absenceParticipantKeys,
  absenceReason,
  absenceSwapMeta,
  absenceWindowOf,
  buildAbsenceLessons,
  isAbsenceParticipant,
  isCoParticipant,
  isSlotInAbsence,
  periodsInWindow,
  summarizeAbsenceLessons,
  type AbsenceSwapRow,
  type AbsenceTimetableEntry,
} from '../../src/lib/absenceLessons';

let passed = 0;
const failures: string[] = [];
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ─── 1) 교시 겹침 ─────────────────────────────────────────
const w = (s: string, e: string) => {
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return { startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em };
};
check('10:30~16:00 → 2~7교시', eq(periodsInWindow(w('10:30', '16:00')), [2, 3, 4, 5, 6, 7]));
check('09:00~10:00 → 1교시만(경계 반열림)', eq(periodsInWindow(w('09:00', '10:00')), [1]));
check('09:50~10:00 쉬는 시간 → 없음', eq(periodsInWindow(w('09:50', '10:00')), []));
check('12:00~12:50 점심 → 없음', eq(periodsInWindow(w('12:00', '12:50')), []));
check('12:00~12:51 → 4교시', eq(periodsInWindow(w('12:00', '12:51')), [4]));
check('방과 후 17:00~18:00 → 없음', eq(periodsInWindow(w('17:00', '18:00')), []));

// ─── 2) 결강 구간 ─────────────────────────────────────────
const day = new Date(2026, 8, 30); // 2026-09-30 (수)
const at = (h: number, m = 0, d = day) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
const win = absenceWindowOf(at(10, 30), at(16, 0))!;
check('구간 날짜', win.date === '2026-09-30', win.date);
check('구간 요일 = 수(3)', win.weekday === 3, String(win.weekday));
check('하루 종일 → 전 교시', eq(periodsInWindow(absenceWindowOf(at(0), at(23, 59), true)!), [1, 2, 3, 4, 5, 6, 7]));
const overnight = absenceWindowOf(at(15, 0), at(9, 0, new Date(2026, 9, 1)))!;
check('다음 날로 넘어가면 시작일 하루로 자른다', overnight.date === '2026-09-30' && overnight.endMinutes === 1440);
check('끝 ≤ 시작이면 구간 없음', absenceWindowOf(at(11), at(10)) === null);
check('잘못된 날짜면 구간 없음', absenceWindowOf('x', 'y') === null);
check('결강 칸 판정', isSlotInAbsence(win, '2026-09-30', 3) && !isSlotInAbsence(win, '2026-09-30', 1));
check('다른 날은 결강 칸 아님', !isSlotInAbsence(win, '2026-10-07', 3));

// ─── 3) 결강 수업과 처리 상태 ─────────────────────────────
const ME = 'me';
const entry = (period: number, over: Partial<AbsenceTimetableEntry> = {}): AbsenceTimetableEntry => ({
  id: `e${period}`,
  type: 'pattern',
  weekday: 3,
  period,
  subject: `과목${period} 1-${period}`,
  grade: 1,
  class_number: String(period),
  section_id: `s${period}`,
  ...over,
});
let sid = 0;
const swap = (period: number, status: string, over: Partial<AbsenceSwapRow> = {}): AbsenceSwapRow => ({
  id: `sw${(sid += 1)}`,
  status,
  requester_resource_id: ME,
  requester_swap_date: '2026-09-30',
  requester_original_period: period,
  approver_swap_date: '2026-10-01',
  approver_original_period: 5,
  requested_at: `2026-09-2${sid}T00:00:00Z`,
  meta: { approver_name: '김교사', requester_section_name: `과목${period} 1-${period}`, grade: 1, class: period },
  ...over,
});

const entries: AbsenceTimetableEntry[] = [
  entry(1), // 결강 밖
  entry(2),
  entry(3),
  entry(5),
  entry(6, { weekday: 4 }), // 다른 요일
  entry(7, { type: 'meeting' }), // 수업 아님
];
{
  const lessons = buildAbsenceLessons(win, entries, [], ME);
  check('걸린 수업만 — 2·3·5교시', eq(lessons.map((l) => l.period), [2, 3, 5]), JSON.stringify(lessons.map((l) => l.period)));
  check('요청 없으면 전부 미처리', lessons.every((l) => l.state === 'unhandled'));
  check('요약 0/3', eq(summarizeAbsenceLessons(lessons), { total: 3, resolved: 0, pending: 0, open: 3 }));
}
{
  // 3교시는 승인돼 시간표에서 이미 빠졌다(useTimetableData 가 지운다)
  const withoutP3 = entries.filter((e) => e.period !== 3);
  const swaps = [
    swap(2, 'rejected'),
    swap(2, 'pending'),
    swap(3, 'approved', { meta: { type: 'substitute', approver_name: '이교사', requester_section_name: '과목3 1-3', grade: 1, class: 3 } }),
    swap(5, 'rejected', { meta: { approver_name: '박교사', requester_section_name: '과목5 1-5' } }),
    swap(5, 'cancelled'),
    swap(2, 'approved', { requester_swap_date: '2026-10-07' }), // 다른 날 — 무관
    swap(2, 'approved', { requester_resource_id: 'someone' }), // 남의 요청 — 무관
  ];
  const lessons = buildAbsenceLessons(win, withoutP3, swaps, ME);
  const by = (p: number) => lessons.find((l) => l.period === p);
  check('승인돼 빠진 3교시가 되살아난다', by(3)?.state === 'approved', JSON.stringify(by(3)));
  check('되살린 수업은 요청 행에서 과목·학급을 채운다', by(3)?.subject === '과목3 1-3' && by(3)?.gradeClass === '1학년 3반');
  check('대기가 거절보다 우선', by(2)?.state === 'pending');
  check('대기 중이면 lastRejected 없음', by(2)?.lastRejected === undefined);
  check('거절·취소만 있으면 미처리 + 마지막 거절', by(5)?.state === 'unhandled' && by(5)?.lastRejected?.meta?.approver_name === '박교사');
  check('다른 날·남의 요청은 무시', lessons.length === 3);
  check('요약 1/3 · 대기 1 · 미처리 1', eq(summarizeAbsenceLessons(lessons), { total: 3, resolved: 1, pending: 1, open: 1 }));
}
{
  // 승인이 대기보다 우선 (같은 교시에 둘 다 있을 때)
  const lessons = buildAbsenceLessons(win, [entry(2)], [swap(2, 'pending'), swap(2, 'approved')], ME);
  check('승인이 대기보다 우선', lessons[0]?.state === 'approved');
}
{
  // 다른 교체로 내가 맡게 된 수업 — 여기서 다시 교체할 수 없다
  const swappedIn = entry(4, { is_swapped: true, swap_date: '2026-09-30', section_id: 'x' });
  const otherWeek = entry(6, { is_swapped: true, swap_date: '2026-10-07' });
  const lessons = buildAbsenceLessons(win, [swappedIn, otherWeek], [], ME);
  check('교체로 맡은 수업은 swapped_in', lessons.length === 1 && lessons[0].state === 'swapped_in');
  check('swapped_in 은 미처리로 센다', summarizeAbsenceLessons(lessons).open === 1);
}

// ─── 4) 사유 · 참여자 ─────────────────────────────────────
const secret = '산부인과 진료';
check('⚠ 개인일정 사유에 제목이 없다', !absenceReason('personal', secret).includes(secret));
check('개인일정 사유 = 개인 사정', absenceReason('personal').includes('개인 사정'));
check('출장 사유에 제목', absenceReason('event', '교육청 연수').includes('교육청 연수'));
check('출장 제목 없으면 일반 문구', absenceReason('event', '  ') === '출장으로 수업을 할 수 없습니다.');
check('결강 meta 에는 id·종류뿐(제목 없음)', eq(Object.keys(absenceSwapMeta({ meetingId: 'm', kind: 'personal', title: secret, window: win })).sort(), ['absence_kind', 'absence_meeting_id']));
check('결강 없으면 meta 없음', eq(absenceSwapMeta(undefined), {}));

check('개인일정 = 만든 사람', isAbsenceParticipant({ kind: 'personal', created_by: ME }, { resourceId: ME }));
check('남의 개인일정 아님', !isAbsenceParticipant({ kind: 'personal', created_by: 'x' }, { resourceId: ME }));
check('출장 객체형 이름', isAbsenceParticipant({ kind: 'event', assignee: { 홍길동: { name: '홍길동' } } }, { resourceId: ME, name: '홍길동' }));
check('출장 구형 문자열(id)', isAbsenceParticipant({ kind: 'event', assignee: `a, ${ME}` }, { resourceId: ME }));
check('대상자 없는 출장(회의) = 아무도 안 빠짐', !isAbsenceParticipant({ kind: 'event', created_by: ME, assignee: undefined }, { resourceId: ME, name: '홍' }));
check('다른 종류(연수)는 결강 아님', !isAbsenceParticipant({ kind: 'training', created_by: ME }, { resourceId: ME }));
check('참여자 키 펼치기', eq(absenceParticipantKeys({ a: { name: 'A' }, b: { name: 'b' } }), ['a', 'A', 'b']));
check('동행 판정(이름)', isCoParticipant({ coParticipantKeys: ['김', 'id9'] }, { name: '김' }));
check('동행 판정(id)', isCoParticipant({ coParticipantKeys: ['김', 'id9'] }, { id: 'id9', name: '박' }));
check('동행 목록 없으면 거짓', !isCoParticipant(undefined, { id: 'id9' }));

// ─── 5) 교체 상대 날짜 ────────────────────────────────────
{
  const today = new Date(2026, 8, 27); // 2026-09-27(일)
  // 상대 수업이 수 3교시 — 결강 날짜 그 칸은 막혀야 한다
  const opts = absenceApproverDateOptions(win, 3, 3, today);
  const same = opts.find((o) => o.date === '2026-09-30');
  check('결강일 같은 칸은 blocked', same?.blocked === true, JSON.stringify(opts));
  check('지난 날은 빠진다(앞 주 9/23)', !opts.some((o) => o.date === '2026-09-23'));
  check('다른 주 같은 요일은 열린다', opts.some((o) => o.date === '2026-10-07' && !o.blocked));
  const optsP1 = absenceApproverDateOptions(win, 3, 1, today);
  check('결강일이라도 결강 밖 교시(1교시)는 열린다', optsP1.find((o) => o.date === '2026-09-30')?.blocked === false);
  // 먼 미래 결강(12월) — "이번 주부터 4주" 였다면 결강 주가 선택지에 없다
  const far = absenceWindowOf(new Date(2026, 11, 16, 9), new Date(2026, 11, 16, 12))!;
  const farOpts = absenceApproverDateOptions(far, 4, 2, today);
  check('먼 미래 결강도 그 주 근처에서 고른다', farOpts.some((o) => o.date === '2026-12-17'), JSON.stringify(farOpts));
  check('선택지 최대 4개', farOpts.length === 4);
}

// ─── 6) 정적 검사 ────────────────────────────────────────
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const swapReq = read('src/components/timetable/SwapRequestDialog.tsx');
const subReq = read('src/components/timetable/SubstituteRequestDialog.tsx');
check('교체 신청이 결강 출처를 meta 에 남긴다', swapReq.includes('...absenceSwapMeta(absence)'));
check('대체 신청이 결강 출처를 meta 에 남긴다', subReq.includes('...absenceSwapMeta(absence)'));
check(
  '⚠ 신청 모달이 개인일정 제목을 사유로 쓰지 않는다',
  [swapReq, subReq].every((s) => s.includes("absence.kind === 'event' ? absence.title : undefined"))
);
const resolution = read('src/components/schedule/absence/AbsenceResolutionDialog.tsx');
check('⚠ 결강 처리 모달이 개인일정 제목을 넘기지 않는다', resolution.includes("title: kind === 'event' ? meeting.title : undefined"));
check('결강 처리 모달은 신청 모달을 겹쳐 띄운다(자기를 닫지 않는다)', resolution.includes('<ClassSwapDialog') && !/openSwap[\s\S]{0,200}onOpenChange\(false\)/.test(resolution));

const mutations = read('src/hooks/useClassSwapMutations.ts');
check('⚠ 거절이 meta 를 덮어쓰지 않는다(병합)', mutations.includes('{ ...prevMeta, rejection_reason }') && !mutations.includes('updateData.meta = { rejection_reason };'));

const app = read('src/App.tsx');
check('결강 처리 호스트는 App 에 하나만', (app.match(/<AbsenceResolutionHost \/>/g) ?? []).length === 1);

const service = read('src/services/absenceLessonService.ts');
const notifyBody = service.slice(service.indexOf('export async function notifyAbsenceParticipants'));
check("⚠ 남에게 보내는 알림 insert 에 .select() 없음", /from\('notification_events'\)\.insert\(rows\);/.test(notifyBody));

const nav = read('src/components/notifications/notificationNavigation.ts');
check('알림 → /schedule?absence=', nav.includes("type === 'absence_lessons'") && nav.includes('/schedule?absence='));

const param = read('src/components/schedule/absence/useOpenAbsenceResolution.ts');
check('호스트 파라미터 이름 = absence (알림 경로와 짝)', param.includes("ABSENCE_PARAM = 'absence'"));

const create = read('src/components/schedule/ScheduleCreateDialog.tsx');
check('생성 모달은 저장을 막지 않는다(결강이 submit disabled 조건에 없다)', !/disabled=\{[^}]*willResolveAbsence/.test(create));
check('생성 모달은 닫힌 다음 프레임에 결강 처리를 연다', create.includes('requestAnimationFrame(() => openAbsenceResolution(result))'));

const strip = read('src/components/timetable/DayPeriodStrip.tsx');
check('교시 스트립이 여러 교시 제거를 받는다', strip.includes('removed?: number | number[]'));

// ─── 결과 ────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`✗ ${failures.length}건 실패 / ${passed}건 통과`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ 결강 처리 회귀 ${passed}건 통과`);
