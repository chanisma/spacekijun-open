// 일별 계획표(plan 뷰) 날짜·시간 유틸 단위 검증
// 실행: npx tsx scripts/schedule-plan-test/run.mts
import {
  formatEventTimeText, getEventDayKeys, isAllDayEvent, parseEventAt, toDateKey,
} from '../../src/lib/scheduleUtils';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// 로컬 타임존 기준 ISO(오프셋 포함) 생성 — 저장 형식(toISOString)을 모사한다
const localIso = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).toISOString();

console.log('▶ parseEventAt: 두 저장 형식');
// 오프셋 없는 NEIS 문자열 = 로컬 시각으로 파싱
ok(toDateKey(parseEventAt('2026-08-12T00:00:00')!) === '2026-08-12', 'naive 문자열 → 로컬 날짜 유지');
// 오프셋 있는 UTC 인스턴트 = 로컬로 환산해도 같은 날
ok(toDateKey(parseEventAt(localIso(2026, 8, 12, 9, 0))!) === '2026-08-12', 'UTC 인스턴트 → 로컬 날짜 복원');
// 오전 이른 시각도 하루 밀리지 않는다 (원시 prefix 비교였다면 8/11로 밀렸을 케이스)
ok(toDateKey(parseEventAt(localIso(2026, 8, 12, 8, 0))!) === '2026-08-12', '오전 8시 일정이 전날로 밀리지 않음');
ok(parseEventAt(null) === null && parseEventAt('') === null && parseEventAt('쓰레기') === null, '잘못된 값 → null');

console.log('▶ getEventDayKeys: 여러 날 전개');
ok(eq(getEventDayKeys({ starts_at: localIso(2026, 8, 12, 9), ends_at: localIso(2026, 8, 12, 18) }),
  ['2026-08-12']), '하루 일정 = 1일');
ok(eq(getEventDayKeys({ starts_at: localIso(2026, 8, 12, 9), ends_at: localIso(2026, 8, 14, 18) }),
  ['2026-08-12', '2026-08-13', '2026-08-14']), '3일 출장 = 3일 전개');
// 자정 종료는 앞 날의 끝으로 본다 (8/13 00:00 종료 → 8/12까지)
ok(eq(getEventDayKeys({ starts_at: localIso(2026, 8, 12, 9), ends_at: localIso(2026, 8, 13, 0) }),
  ['2026-08-12']), '자정 종료 = 전날까지');
ok(eq(getEventDayKeys({ starts_at: '2026-08-12T00:00:00', ends_at: '2026-08-12T23:59:59' }),
  ['2026-08-12']), 'NEIS 종일(00:00~23:59) = 1일');
ok(eq(getEventDayKeys({ starts_at: localIso(2026, 8, 12, 9), ends_at: localIso(2026, 8, 10, 9) }),
  ['2026-08-12']), '종료가 시작보다 빠르면 시작일만');
ok(eq(getEventDayKeys({ starts_at: localIso(2026, 8, 12, 9), ends_at: undefined as any }),
  ['2026-08-12']), 'ends_at 없음 = 시작일만');
ok(eq(getEventDayKeys({ starts_at: '', ends_at: '' }), []), '시작 없음 = 빈 배열');
// 월 경계를 넘어가도 연속
ok(eq(getEventDayKeys({ starts_at: localIso(2026, 8, 31, 9), ends_at: localIso(2026, 9, 2, 18) }),
  ['2026-08-31', '2026-09-01', '2026-09-02']), '월 경계 연속 전개');
// 상한: 비정상 ends_at이 표를 무한정 늘리지 않는다
ok(getEventDayKeys({ starts_at: localIso(2026, 1, 1, 9), ends_at: localIso(2030, 1, 1, 9) }).length === 60,
  '비정상 장기 일정 = 60일 상한');

console.log('▶ isAllDayEvent / formatEventTimeText');
ok(isAllDayEvent({ starts_at: '2026-08-12T00:00:00', ends_at: '2026-08-12T23:59:59' }), 'NEIS 00:00~23:59 = 종일');
ok(isAllDayEvent({ starts_at: localIso(2026, 8, 12, 9), ends_at: localIso(2026, 8, 12, 18), date_only: true }),
  'date_only 플래그 = 종일');
ok(!isAllDayEvent({ starts_at: localIso(2026, 8, 12, 9), ends_at: localIso(2026, 8, 12, 18) }), '09~18시 = 종일 아님');
ok(formatEventTimeText({ starts_at: '2026-08-12T00:00:00', ends_at: '2026-08-12T23:59:59' }) === '종일', '종일 표기');
ok(formatEventTimeText({ starts_at: localIso(2026, 8, 12, 9, 30), ends_at: localIso(2026, 8, 12, 18, 0) })
  === '09:30 ~ 18:00', 'HH:mm ~ HH:mm 표기');
ok(formatEventTimeText({ starts_at: localIso(2026, 8, 12, 14, 0), ends_at: localIso(2026, 8, 12, 14, 0) })
  === '14:00', '시작=종료면 한 번만 표기');

console.log(`\n✅ ${pass} checks passed`);
