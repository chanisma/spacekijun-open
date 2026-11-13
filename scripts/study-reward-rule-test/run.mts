/**
 * 자습 보상 청구 규칙(2026-10-13) — 지난주까지만 · 하루 최대 2회(10코인). 화면(studyClaimable) ↔ 서버(SQL) 숫자 대조.
 * npx tsx --tsconfig tsconfig.app.json scripts/study-reward-rule-test/run.mts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDY_DAILY_CAP, studyClaimable, type StudyEntry } from '../../src/features/academy/game/studyService';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { if (ok) pass += 1; else { fail += 1; console.log(`  ✗ ${name} ${detail}`); } };
const e = (id: string, day: string, claimed = false, eligible = true): StudyEntry =>
  ({ id, day, room: '자습실', period: '1교시', start_time: null, end_time: null, minutes: null, attendance: eligible ? 'attended' : 'pending', eligible, claimed });

const day = '2026-10-06';
const three = [e('b', day), e('a', day), e('c', day)];
const r1 = studyClaimable({ week: '2026-10-05', claim_from: '2026-10-05', entries: three });
check('하루 3회 → 받을 수 있는 것은 2회', r1.claimable.size === 2 && r1.capped.size === 1);
check('같은 날은 예약 id 순서(서버 row_number order by id)', r1.claimable.has('a') && r1.claimable.has('b') && r1.capped.has('c'));
const r2 = studyClaimable({ week: '2026-10-05', claim_from: '2026-10-05', entries: [e('a', day, true), e('b', day), e('c', day)] });
check('이미 받은 것도 하루 상한에 센다', r2.claimable.size === 1 && r2.capped.size === 1);
const r3 = studyClaimable({ week: '2026-09-28', claim_from: '2026-10-05', entries: [e('a', '2026-09-29')] });
check('지난주보다 이른 주 = 기한 지남(받을 것 0)', r3.expired && r3.claimable.size === 0);
const r4 = studyClaimable({ week: '2026-09-28', entries: [e('a', '2026-09-29')] });
check('claim_from 이 없으면(옛 서버) 기한 없음', !r4.expired && r4.claimable.size === 1);
check('날이 다르면 따로 센다', studyClaimable({ week: '2026-10-05', claim_from: '2026-10-05', entries: [e('a', '2026-10-06'), e('b', '2026-10-06'), e('c', '2026-10-07')] }).claimable.size === 3);
check('출석 미확인은 세지 않는다', studyClaimable({ week: '2026-10-05', claim_from: '2026-10-05', entries: [e('a', day, false, false)] }).claimable.size === 0);

const ROOT = process.cwd();
const cap = readFileSync(join(ROOT, 'supabase/migrations/20261013180000_study_attendance_daily_cap.sql'), 'utf-8');
const win = readFileSync(join(ROOT, 'supabase/migrations/20261013170000_academy_study_claim_window.sql'), 'utf-8');
check('하루 상한 SQL ↔ TS(자동 지급 · 수동 청구 · 교직원 체험 셋 다)', STUDY_DAILY_CAP === 2
  && cap.includes('reservation_date = new.reservation_date) < 2 then')
  && (cap.match(/where q\.rn <= 2-\(select count\(\*\)/g) ?? []).length === 2);
check('청구 기한 = 이번 주 − 7일(지난주까지) · 화면에 claim_from', win.includes("if p_week<date_trunc(''week'',today::timestamp)::date-7 then")
  && win.includes("''claim_from'',greatest(date ''2026-09-07'',latest-7)"));
const ui = readFileSync(join(ROOT, 'src/features/academy/game/GameStudyLedger.tsx'), 'utf-8');
check('화면은 받을 수를 규칙으로 센다(부풀리지 않음)', ui.includes('studyClaimable(state)') && ui.includes("'받을 수 있는 기한이 지났어요'"));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
